import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { createMemo, createResource, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../context/tui-config"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"
import fs from "fs/promises"
import path from "path"
import type { RGBA } from "@opentui/core"

import { getScrollAcceleration } from "../../util/scroll"
import { WorkspaceLabel } from "../../component/workspace-label"
import { getDiffStat, getGitBranch, getGitStatus, getLatestCommit } from "../../util/git"
import { ProofOfDone } from "../../component/proof-of-done"

function SectionHeader(props: { icon: string; label: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
      <text fg={theme.secondary}>{props.icon}</text>
      <text fg={theme.text}>
        <b>{props.label}</b>
      </text>
    </box>
  )
}

function Row(props: { label: string; value: string; fg?: RGBA }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={theme.textMuted}>{props.label}</text>
      <text fg={props.fg ?? theme.text}>{props.value}</text>
    </box>
  )
}

function ProjectStatsPanel() {
  const { theme } = useTheme()
  const stat = createMemo(() => getDiffStat())
  return (
    <box gap={0}>
      <SectionHeader icon="▤" label="PROJECT STATS" />
      <box paddingLeft={1} gap={0}>
        <Row label="Files changed:" value={String(stat().filesChanged)} />
        <Row label="Lines added:" value={`+${stat().linesAdded}`} fg={theme.success} />
        <Row label="Lines removed:" value={`-${stat().linesRemoved}`} fg={theme.error} />
      </box>
    </box>
  )
}

function detectPackageManager(): string {
  const candidates: [string, string][] = [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ]
  for (const [file, manager] of candidates) {
    try {
      require("fs").accessSync(path.join(process.cwd(), file))
      return manager
    } catch {}
  }
  return "unknown"
}

function EnvironmentPanel() {
  const { theme } = useTheme()
  const packageManager = createMemo(() => detectPackageManager())
  const framework = createMemo(() => {
    try {
      const pkg = require(process.cwd() + "/package.json")
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const entries = Object.entries(deps as Record<string, string>).filter(([name]) =>
        ["next", "react", "vue", "svelte", "express"].includes(name),
      )
      if (entries.length === 0) return undefined
      const [name, version] = entries[0]
      return `${name}@${String(version).replace(/^[\^~]/, "")}`
    } catch {
      return undefined
    }
  })

  return (
    <box gap={0}>
      <SectionHeader icon="⬢" label="ENVIRONMENT" />
      <box paddingLeft={1} gap={0}>
        <Row label="Node:" value={process.version} />
        <Row label="Bun:" value={typeof Bun !== "undefined" ? Bun.version : "n/a"} />
        <Row label="Package mgr:" value={packageManager()} />
        <Show when={framework()}>
          <Row label="Framework:" value={framework()!} />
        </Show>
      </box>
    </box>
  )
}

function GitStatusPanel() {
  const { theme } = useTheme()
  const branch = createMemo(() => getGitBranch())
  const status = createMemo(() => getGitStatus())
  const commit = createMemo(() => getLatestCommit())

  return (
    <box gap={0}>
      <SectionHeader icon="⎇" label="GIT STATUS" />
      <box paddingLeft={1} gap={0}>
        <Row label="Branch:" value={branch()} fg={theme.info} />
        <Row label="Status:" value={status() || "unknown"} fg={status() === "clean" ? theme.success : theme.warning} />
        <Show when={commit()}>
          <Row label="Latest:" value={`${commit()!.hash} ${commit()!.subject}`.slice(0, 34)} />
        </Show>
      </box>
    </box>
  )
}

type BenchGroup = {
  n: number
  successRate: number
  medianTokens: number
  medianDurationS: number
}

type BenchSummary = {
  runId: string
  overall: { stock: BenchGroup; olicode: BenchGroup }
}

async function findLatestBenchSummary(): Promise<BenchSummary | undefined> {
  const resultsDir = path.join(process.cwd(), "bench", "results")
  try {
    const entries = await fs.readdir(resultsDir, { withFileTypes: true })
    const runs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    if (runs.length === 0) return undefined
    const stats = await Promise.all(
      runs.map(async (run) => ({
        run,
        mtime: (await fs.stat(path.join(resultsDir, run)).catch(() => undefined))?.mtimeMs ?? 0,
      })),
    )
    const latest = stats.toSorted((a, b) => b.mtime - a.mtime)[0]
    if (!latest) return undefined
    const raw = await fs.readFile(path.join(resultsDir, latest.run, "summary.json"), "utf8").catch(() => undefined)
    if (!raw) return undefined
    return JSON.parse(raw) as BenchSummary
  } catch {
    return undefined
  }
}

function EfficiencyBenchmarkPanel() {
  const { theme } = useTheme()
  const [summary] = createResource(findLatestBenchSummary)

  const tokenDelta = createMemo(() => {
    const s = summary()
    if (!s) return undefined
    const { stock, olicode } = s.overall
    if (stock.medianTokens === 0) return undefined
    return ((olicode.medianTokens - stock.medianTokens) / stock.medianTokens) * 100
  })

  const timeDelta = createMemo(() => {
    const s = summary()
    if (!s) return undefined
    const { stock, olicode } = s.overall
    if (stock.medianDurationS === 0) return undefined
    return ((olicode.medianDurationS - stock.medianDurationS) / stock.medianDurationS) * 100
  })

  return (
    <box gap={0}>
      <SectionHeader icon="◈" label="EFFICIENCY BENCHMARK" />
      <box paddingLeft={1} gap={0}>
        <Show
          when={summary()}
          fallback={
            <text fg={theme.textMuted}>No benchmark run yet — `bun run olibench`</text>
          }
        >
          <Row label="Run:" value={summary()!.runId} />
          <Row
            label="Tokens vs stock:"
            value={tokenDelta() !== undefined ? `${tokenDelta()! > 0 ? "+" : ""}${tokenDelta()!.toFixed(0)}%` : "n/a"}
            fg={tokenDelta() !== undefined && tokenDelta()! < 0 ? theme.success : theme.warning}
          />
          <Row
            label="Time vs stock:"
            value={timeDelta() !== undefined ? `${timeDelta()! > 0 ? "+" : ""}${timeDelta()!.toFixed(0)}%` : "n/a"}
            fg={timeDelta() !== undefined && timeDelta()! < 0 ? theme.success : theme.warning}
          />
          <Row label="Sample size:" value={`${summary()!.overall.olicode.n} tasks/arm`} />
        </Show>
      </box>
    </box>
  )
}

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <TuiPluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </TuiPluginRuntime.Slot>
            <TuiPluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />

            <text fg={theme.border}>{"─".repeat(38)}</text>
            <text fg={theme.primary}>
              <b>INTELLIGENCE CENTER</b>
            </text>
            <ProjectStatsPanel />
            <EnvironmentPanel />
            <GitStatusPanel />
            <ProofOfDone sessionID={props.sessionID} />
            <EfficiencyBenchmarkPanel />
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <TuiPluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.success }}>•</span> <b>Open</b>
              <span style={{ fg: theme.text }}>
                <b>Code</b>
              </span>{" "}
              <span>{InstallationVersion}</span>
            </text>
          </TuiPluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}
