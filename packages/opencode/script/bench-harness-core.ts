import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const model = process.env.OLI_BENCH_MODEL
if (!model) throw new Error("Set OLI_BENCH_MODEL to the exact provider/model used for both variants.")
const runs = Number(process.env.OLI_BENCH_RUNS ?? 3)
if (!Number.isInteger(runs) || runs < 1) throw new Error("OLI_BENCH_RUNS must be a positive integer.")
const taskFilter = process.env.OLI_BENCH_TASK
const variantFilter = process.env.OLI_BENCH_VARIANT
const runTimeout = Number(process.env.OLI_BENCH_TIMEOUT_MS ?? 120_000)
const output = process.env.OLI_BENCH_OUTPUT ?? path.join(os.tmpdir(), "olibench-core.json")

const fixture = path.resolve(import.meta.dir, "../test/fixture/harness-benchmark")
const tasks = JSON.parse(readFileSync(path.join(fixture, "tasks.json"), "utf8")) as Array<{
  id: string
  prompt: string
  check: string
}>

async function command(args: string[], cwd: string, env: Record<string, string> = {}, timeout?: number) {
  const started = performance.now()
  const child = Bun.spawn(args, {
    cwd,
    env: { ...globalThis.process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  })
  let timedOut = false
  const timer = timeout
    ? setTimeout(() => {
        timedOut = true
        process.kill(-child.pid, "SIGKILL")
      }, timeout)
    : undefined
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (timer) clearTimeout(timer)
  return { stdout, stderr, exitCode, timedOut, milliseconds: performance.now() - started }
}

function metrics(output: string) {
  const events = output
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown]
      } catch {
        return []
      }
    })
  const tools = new Map<string, Record<string, unknown>>()
  const steps = new Map<string, Record<string, unknown>>()
  const harness: Array<Record<string, unknown>> = []
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
    if (item.type === "harness") harness.push(item)
    Object.values(item).forEach(visit)
  }
  events.forEach(visit)
  const completed = [...tools.values()].filter(
    (item) =>
      item.state && typeof item.state === "object" && (item.state as Record<string, unknown>).status === "completed",
  )
  const tokens = [...steps.values()].map((item) => item.tokens as Record<string, unknown>)
  const number = (value: unknown) => (typeof value === "number" ? value : 0)
  return {
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
    skillsLoaded: completed.filter((item) => item.tool === "skill").length,
    filesRead: new Set(
      completed
        .filter((item) => item.tool === "read")
        .map((item) => (item.state as Record<string, Record<string, unknown>>).input?.filePath)
        .filter((item): item is string => typeof item === "string"),
    ).size,
    failedCommands: completed.filter(
      (item) => item.tool === "shell" && (item.state as Record<string, Record<string, unknown>>).metadata?.exit !== 0,
    ).length,
    retries:
      harness.filter((item) => item.kind === "proof").length > 1
        ? harness.filter((item) => item.kind === "proof").length - 1
        : 0,
    scopeViolations: harness.filter(
      (item) => item.kind === "completion" && JSON.stringify(item.data).includes("UNRELATED"),
    ).length,
    unsupportedCompletionClaims: harness.filter(
      (item) => item.kind === "completion" && (item.data as Record<string, unknown>)?.decision === "BLOCK",
    ).length,
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
        await command(["git", "init", "-q"], directory)
        await command(["git", "add", "."], directory)
        await command(
          ["git", "-c", "user.name=OliBench", "-c", "user.email=bench@localhost", "commit", "-qm", "fixture"],
          directory,
        )
        const run = await command(
          [
            "bun",
            "run",
            "--conditions=browser",
            "src/index.ts",
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
        const verification = await command(["bun", "test"], directory)
        const acceptance = await command(["bun", "-e", task.check], directory)
        const diff = await command(["git", "diff", "--numstat"], directory)
        const changed = diff.stdout.trim().split("\n").filter(Boolean)
        results.push({
          task: task.id,
          variant,
          trial,
          model,
          success: run.exitCode === 0 && verification.exitCode === 0 && acceptance.exitCode === 0,
          timedOut: run.timedOut,
          wallMilliseconds: Math.round(run.milliseconds),
          ...metrics(run.stdout),
          filesChanged: changed.length,
          additions: changed.reduce((total, line) => total + Number(line.split("\t")[0] || 0), 0),
          deletions: changed.reduce((total, line) => total + Number(line.split("\t")[1] || 0), 0),
          error: run.exitCode === 0 ? undefined : run.stderr.trim().slice(-1000),
        })
        await Bun.write(output, JSON.stringify({ model, runs, trials: results }, null, 2))
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

const report = JSON.stringify({ generatedAt: new Date().toISOString(), model, runs, summary, trials: results }, null, 2)
await Bun.write(output, report)
console.error(`OLIBENCH_REPORT=${output}`)
console.log(report)
