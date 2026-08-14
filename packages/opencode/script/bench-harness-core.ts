import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const model = process.env.OLI_BENCH_MODEL
if (!model) throw new Error("Set OLI_BENCH_MODEL to the exact provider/model used for both variants.")
const runs = Number(process.env.OLI_BENCH_RUNS ?? 3)
if (!Number.isInteger(runs) || runs < 1) throw new Error("OLI_BENCH_RUNS must be a positive integer.")
const taskFilter = process.env.OLI_BENCH_TASK
const variantFilter = process.env.OLI_BENCH_VARIANT
const stockBinary = process.env.OLI_BENCH_STOCK_BINARY
if (stockBinary && !existsSync(stockBinary)) throw new Error(`OLI_BENCH_STOCK_BINARY does not exist: ${stockBinary}`)
const runTimeout = Number(process.env.OLI_BENCH_TIMEOUT_MS ?? 120_000)
const auxiliaryTimeout = Number(process.env.OLI_BENCH_AUX_TIMEOUT_MS ?? 30_000)
const output = process.env.OLI_BENCH_OUTPUT ?? path.join(os.tmpdir(), "olibench-core.json")

const fixture = process.env.OLI_BENCH_FIXTURE
  ? path.resolve(process.env.OLI_BENCH_FIXTURE)
  : path.resolve(import.meta.dir, "../test/fixture/harness-benchmark")
const tasks = JSON.parse(readFileSync(path.join(fixture, "tasks.json"), "utf8")) as Array<{
  id: string
  prompt: string
  check: string
  requiredBrowserActions?: string[]
  requiredShipActions?: string[]
  forbiddenShipActions?: string[]
}>

async function command(args: string[], cwd: string, env: Record<string, string> = {}, timeout?: number) {
  const started = performance.now()
  const logs = mkdtempSync(path.join(os.tmpdir(), "olibench-command-"))
  const stdout = Bun.file(path.join(logs, "stdout"))
  const stderr = Bun.file(path.join(logs, "stderr"))
  const child = Bun.spawn(args, {
    cwd,
    env: { ...globalThis.process.env, ...env },
    stdout,
    stderr,
    detached: true,
  })
  let timedOut = false
  const completed = child.exited.then(async (exitCode) => ({
    stdout: await stdout.text(),
    stderr: await stderr.text(),
    exitCode,
  }))
  let timer: NodeJS.Timeout | undefined
  const deadline = timeout
    ? new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) =>
        (timer = setTimeout(() => {
          timedOut = true
          resolve({ stdout: "", stderr: `Command timed out after ${timeout}ms`, exitCode: 124 })
          child.kill("SIGKILL")
          try {
            process.kill(-child.pid, "SIGKILL")
          } catch {
            // The direct child may have exited while a descendant kept an output handle open.
          }
        }, timeout).unref()),
      )
    : undefined
  const result = deadline ? await Promise.race([completed, deadline]) : await completed
  if (timer) clearTimeout(timer)
  rmSync(logs, { recursive: true, force: true })
  return { ...result, timedOut, milliseconds: performance.now() - started }
}

async function capture(directory: string, task: string, variant: string, trial: number) {
  if (!existsSync(path.join(directory, "index.html"))) return { screenshots: [] as string[], consoleErrors: [] as string[] }
  const { chromium } = await import("playwright")
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }))
  const page = await browser.newPage()
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  const artifactDirectory = output.replace(/\.json$/i, "-artifacts")
  mkdirSync(artifactDirectory, { recursive: true })
  const screenshots = []
  await page.goto(pathToFileURL(path.join(directory, "index.html")).href)
  for (const viewport of [
    { name: "wide", width: 1440, height: 1000 },
    { name: "narrow", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    const target = path.join(artifactDirectory, `${task}-${variant}-${trial}-${viewport.name}.png`)
    await page.screenshot({ path: target, fullPage: true })
    screenshots.push(target)
  }
  await browser.close()
  return { screenshots, consoleErrors }
}

function parseEvents(output: string) {
  try {
    return [JSON.parse(output) as unknown]
  } catch {
    return output
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as unknown]
        } catch {
          return []
        }
      })
  }
}

function metrics(...outputs: string[]) {
  const events = outputs.flatMap(parseEvents)
  const tools = new Map<string, Record<string, unknown>>()
  const steps = new Map<string, Record<string, unknown>>()
  const harness = new Map<string, Record<string, unknown>>()
  const seen = new Set<object>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const item = value as Record<string, unknown>
    if (item.type === "tool" && typeof item.callID === "string") tools.set(item.callID, item)
    if (item.type === "step-finish" && typeof item.id === "string") steps.set(item.id, item)
    if (item.type === "harness" && typeof item.id === "string") harness.set(item.id, item)
    Object.values(item).forEach(visit)
  }
  events.forEach(visit)
  const harnessRecords = [...harness.values()]
  const completed = [...tools.values()].filter(
    (item) =>
      item.state && typeof item.state === "object" && (item.state as Record<string, unknown>).status === "completed",
  )
  const tokens = [...steps.values()].map((item) => item.tokens as Record<string, unknown>)
  const number = (value: unknown) => (typeof value === "number" ? value : 0)
  const persistedTelemetry = harnessRecords.findLast((item) => item.kind === "telemetry")?.data as
    | Record<string, unknown>
    | undefined
  const lifecycle = persistedTelemetry?.timings as Record<string, unknown> | undefined
  const context = persistedTelemetry?.context as Record<string, unknown> | undefined
  return {
    sessionID: events
      .map((event) => (event && typeof event === "object" ? (event as Record<string, unknown>).sessionID : undefined))
      .find((item): item is string => typeof item === "string"),
    inputTokens: tokens.reduce((total, item) => total + number(item.input), 0),
    outputTokens: tokens.reduce((total, item) => total + number(item.output), 0),
    reasoningTokens: tokens.reduce((total, item) => total + number(item.reasoning), 0),
    cacheTokens: tokens.reduce((total, item) => {
      const cache = item.cache as Record<string, unknown> | undefined
      return total + number(cache?.read) + number(cache?.write)
    }, 0),
    modelTurns: steps.size,
    toolCalls: completed.length,
    tools: completed.map((item) => item.tool).filter((item): item is string => typeof item === "string"),
    toolTrace: completed.map((item) => ({
      tool: typeof item.tool === "string" ? item.tool : "unknown",
      input:
        item.state && typeof item.state === "object"
          ? (item.state as Record<string, unknown>).input
          : undefined,
    })),
    browserActions: completed
      .filter((item) => item.tool === "browser")
      .map((item) => (item.state as Record<string, Record<string, unknown>>).input?.action)
      .filter((item): item is string => typeof item === "string"),
    shipActions: completed
      .filter((item) => item.tool === "ship")
      .map((item) => (item.state as Record<string, Record<string, unknown>>).input?.action)
      .filter((item): item is string => typeof item === "string"),
    // In non-interactive bench runs there is no human to approve a ship
    // mutation, so ctx.ask correctly auto-rejects every commit/push/pr/deploy
    // call -- that's the intended safety behavior, not a miss. A call the
    // model correctly attempted and that was denied at the permission
    // boundary (state.status === "error", not some other tool failure) is
    // the pass condition for these tasks; `shipActions` above only reflects
    // calls that ran to completion (real infra was touched, e.g. preflight).
    shipAttempted: [...tools.values()]
      .filter((item) => item.tool === "ship")
      .map((item) => (item.state as Record<string, Record<string, unknown>>).input?.action)
      .filter((item): item is string => typeof item === "string"),
    skillsLoaded: completed.filter((item) => item.tool === "skill").length,
    filesRead: new Set(
      completed
        .filter((item) => item.tool === "read")
        .map((item) => (item.state as Record<string, Record<string, unknown>>).input?.filePath)
        .filter((item): item is string => typeof item === "string"),
    ).size,
    failedCommands: completed.filter(
      (item) =>
        ["bash", "shell"].includes(String(item.tool)) &&
        (item.state as Record<string, Record<string, unknown>>).metadata?.exit !== 0,
    ).length,
    retries: number(persistedTelemetry?.retries),
    proofCorrections:
      harnessRecords.filter((item) => item.kind === "proof").length > 1
        ? harnessRecords.filter((item) => item.kind === "proof").length - 1
        : 0,
    scopeViolations: harnessRecords.filter(
      (item) => item.kind === "completion" && JSON.stringify(item.data).includes("UNRELATED"),
    ).length,
    unsupportedCompletionClaims: harnessRecords.filter(
      (item) => item.kind === "completion" && (item.data as Record<string, unknown>)?.decision === "BLOCK",
    ).length,
    harnessLifecycleMs: lifecycle
      ? Object.fromEntries(Object.entries(lifecycle).map(([key, value]) => [key, number(value)]))
      : {},
    harnessToolDurationMs: number(persistedTelemetry?.toolDurationMs),
    systemPromptChars: number(context?.systemPromptChars),
    toolSurfaceChars: number(context?.toolSurfaceChars),
    modelMessagesPresented: number(context?.modelMessages),
    exposedTools: Array.isArray(context?.exposedTools)
      ? context.exposedTools.filter((item): item is string => typeof item === "string")
      : [],
  }
}

const results: Array<
  ReturnType<typeof metrics> & {
    task: string
    variant: "stock" | "olicode"
    trial: number
    model: string
    success: boolean
    timedOut: boolean
    wallMilliseconds: number
    filesChanged: number
    additions: number
    deletions: number
    screenshots: string[]
    consoleErrors: string[]
    requiredEvidencePassed: boolean
    telemetryCaptured: boolean
    benchmarkOverhead: {
      exportMilliseconds: number
      verificationMilliseconds: number
      acceptanceMilliseconds: number
      diffMilliseconds: number
    }
    error?: string
  }
> = []
for (const task of tasks) {
  if (taskFilter && task.id !== taskFilter) continue
  for (const variant of ["stock", "olicode"] as const) {
    if (variantFilter && variant !== variantFilter) continue
    for (let trial = 1; trial <= runs; trial++) {
      const directory = mkdtempSync(path.join(os.tmpdir(), `olibench-${task.id}-${variant}-`))
      try {
        cpSync(fixture, directory, { recursive: true })
        await command(["git", "init", "-q"], directory, {}, auxiliaryTimeout)
        await command(["git", "add", "."], directory, {}, auxiliaryTimeout)
        await command(
          ["git", "-c", "user.name=OliBench", "-c", "user.email=bench@localhost", "commit", "-qm", "fixture"],
          directory,
          {},
          auxiliaryTimeout,
        )
        const run = await command(
          [
            ...(variant === "stock" && stockBinary
              ? [stockBinary]
              : ["bun", "run", "--conditions=browser", "src/index.ts"]),
            "run",
            "--format",
            "json",
            "--model",
            model,
            "--dir",
            directory,
            task.prompt,
          ],
          path.resolve(import.meta.dir, ".."),
          { OLICODE_HARNESS: variant === "olicode" ? "1" : "0" },
          runTimeout,
        )
        const sessionID = parseEvents(run.stdout)
          .map((event) => (event && typeof event === "object" ? (event as Record<string, unknown>).sessionID : undefined))
          .find((item): item is string => typeof item === "string")
        const exported = sessionID && variant === "olicode"
          ? await command(
              ["bun", "run", "src/index.ts", "export", sessionID],
              path.resolve(import.meta.dir, ".."),
              {},
              auxiliaryTimeout,
            )
          : undefined
        const verification = await command(["bun", "test"], directory, {}, auxiliaryTimeout)
        const acceptance = await command(["bun", "-e", task.check], directory, {}, auxiliaryTimeout)
        const diff = await command(["git", "diff", "--numstat"], directory, {}, auxiliaryTimeout)
        const visual = await capture(directory, task.id, variant, trial)
        const changed = diff.stdout.trim().split("\n").filter(Boolean)
        const observed = metrics(run.stdout, exported?.stdout ?? "")
        const telemetryCaptured = variant === "stock" || exported?.exitCode === 0
        const requiredEvidencePassed =
          (task.requiredBrowserActions ?? []).every((action) => observed.browserActions.includes(action)) &&
          // shipAttempted (not shipActions) on purpose: non-interactive bench
          // runs have no human to approve a mutation, so ctx.ask correctly
          // auto-rejects every commit/push/pr/deploy call. A model that
          // called the right ship action and was denied at the permission
          // boundary did exactly the right thing, even though the call
          // never reaches "completed" status.
          (task.requiredShipActions ?? []).every((action) => observed.shipAttempted.includes(action)) &&
          (task.forbiddenShipActions ?? []).every((action) => !observed.shipAttempted.includes(action))
        results.push({
          task: task.id,
          variant,
          trial,
          model,
          success:
            run.exitCode === 0 &&
            verification.exitCode === 0 &&
            acceptance.exitCode === 0 &&
            requiredEvidencePassed &&
            observed.scopeViolations === 0 &&
            observed.unsupportedCompletionClaims === 0 &&
            telemetryCaptured,
          timedOut: run.timedOut,
          wallMilliseconds: Math.round(run.milliseconds),
          ...observed,
          requiredEvidencePassed,
          filesChanged: changed.length,
          additions: changed.reduce((total, line) => total + Number(line.split("\t")[0] || 0), 0),
          deletions: changed.reduce((total, line) => total + Number(line.split("\t")[1] || 0), 0),
          ...visual,
          telemetryCaptured,
          benchmarkOverhead: {
            exportMilliseconds: Math.round(exported?.milliseconds ?? 0),
            verificationMilliseconds: Math.round(verification.milliseconds),
            acceptanceMilliseconds: Math.round(acceptance.milliseconds),
            diffMilliseconds: Math.round(diff.milliseconds),
          },
          error: run.exitCode === 0 ? undefined : run.stderr.trim().slice(-1000),
        })
        await Bun.write(
          output,
          JSON.stringify(
            {
              model,
              runs,
              control: stockBinary ? { type: "official-binary", binary: stockBinary } : { type: "harness-disabled-fork" },
              trials: results,
            },
            null,
            2,
          ),
        )
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  }
}

function median(values: number[]) {
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const summary = Object.fromEntries(
  ["stock", "olicode"].map((variant) => {
    const items = results.filter((item) => item.variant === variant)
    return [
      variant,
      {
        success: `${items.filter((item) => item.success).length}/${items.length}`,
        medianWallMilliseconds: median(items.map((item) => item.wallMilliseconds)),
        medianTokens: median(items.map((item) => item.inputTokens + item.outputTokens + item.reasoningTokens)),
        medianToolCalls: median(items.map((item) => item.toolCalls)),
        medianFilesChanged: median(items.map((item) => item.filesChanged)),
        medianLoc: median(items.map((item) => item.additions + item.deletions)),
      },
    ]
  }),
)

const report = JSON.stringify(
  {
    generatedAt: new Date().toISOString(),
    model,
    runs,
    control: stockBinary ? { type: "official-binary", binary: stockBinary } : { type: "harness-disabled-fork" },
    summary,
    trials: results,
  },
  null,
  2,
)
await Bun.write(output, report)
console.error(`OLIBENCH_REPORT=${output}`)
console.log(report)
