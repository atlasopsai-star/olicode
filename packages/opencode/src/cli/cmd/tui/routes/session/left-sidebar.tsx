import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useGamification } from "../../context/gamification"
import { getGitBranch, getGitStatus } from "../../util/git"
import { bar } from "../../util/format"
import type { Mode as HarnessMode } from "@/session/harness"

const WIDTH = 26

const HARNESS_MODES: HarnessMode[] = ["build", "debug", "design", "research", "browser", "ship"]
const HARNESS_MODE_LABEL: Record<HarnessMode, string> = {
  build: "Code",
  debug: "Debug",
  design: "Design",
  research: "Research",
  browser: "Browser",
  ship: "Delivery",
}

const MODE_NAV: { key: string; label: string; agent: string; hint: string }[] = [
  { key: "1", label: "Plan", agent: "planner", hint: "Strategy & roadmap" },
  { key: "2", label: "Build", agent: "builder", hint: "Code & implement" },
  { key: "3", label: "Design", agent: "ux", hint: "UI/UX & visuals" },
  { key: "4", label: "Review", agent: "qa", hint: "Quality & security" },
  { key: "5", label: "Ship", agent: "deploy", hint: "Deploy & monitor" },
]

function Clock() {
  const { theme } = useTheme()
  const [now, setNow] = createSignal(new Date())
  onMount(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    onCleanup(() => clearInterval(id))
  })
  return (
    <text fg={theme.textMuted}>
      {now().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
    </text>
  )
}

function Divider(props: { label?: string }) {
  const { theme } = useTheme()
  if (!props.label) {
    return <text fg={theme.border}>{"─".repeat(WIDTH - 4)}</text>
  }
  const pad = Math.max(0, WIDTH - 4 - props.label.length - 2)
  const left = Math.floor(pad / 2)
  const right = pad - left
  return (
    <text fg={theme.border}>
      {"─".repeat(left)}
      <span style={{ fg: theme.primary }}> {props.label} </span>
      {"─".repeat(right)}
    </text>
  )
}

function ModeNav() {
  const { theme } = useTheme()
  const local = useLocal()
  const current = createMemo(() => local.agent.current()?.name)

  return (
    <box gap={0}>
      <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
        <text fg={theme.primary}>◈</text>
        <text fg={theme.text}>
          <b>COMMAND CENTER</b>
        </text>
      </box>
      {MODE_NAV.map((item) => {
        const active = () => current() === item.agent
        const color = () => local.agent.color(item.agent)
        return (
          <box
            flexDirection="row"
            gap={1}
            paddingLeft={1}
            backgroundColor={active() ? theme.backgroundElement : undefined}
            onMouseUp={() => local.agent.set(item.agent)}
          >
            <text fg={active() ? color() : theme.textMuted}>[{item.key}]</text>
            <box gap={0}>
              <text fg={active() ? theme.text : theme.textMuted}>
                {active() ? <b>{item.label}</b> : item.label}
              </text>
              <text fg={theme.textMuted}>{item.hint}</text>
            </box>
          </box>
        )
      })}
    </box>
  )
}

function HarnessStatus(props: { sessionID: string }) {
  const { theme } = useTheme()
  const sync = useSync()

  const activeMode = createMemo(() => {
    const status = sync.data.session_status?.[props.sessionID] as
      | { metadata?: Record<string, unknown> }
      | undefined
    const mode = status?.metadata?.mode
    return typeof mode === "string" && HARNESS_MODES.includes(mode as HarnessMode) ? (mode as HarnessMode) : undefined
  })

  return (
    <box gap={0}>
      <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
        <text fg={theme.accent}>▣</text>
        <text fg={theme.text}>
          <b>HARNESS STATUS</b>
        </text>
      </box>
      <box paddingLeft={1} gap={0}>
        {HARNESS_MODES.map((mode) => {
          const isActive = () => activeMode() === mode
          return (
            <box flexDirection="row" justifyContent="space-between">
              <text fg={isActive() ? theme.success : theme.textMuted}>{HARNESS_MODE_LABEL[mode]}</text>
              <text fg={isActive() ? theme.success : theme.textMuted}>{isActive() ? "ACTIVE" : "idle"}</text>
            </box>
          )
        })}
      </box>
    </box>
  )
}

function ProjectOverview(props: { sessionID: string }) {
  const { theme } = useTheme()
  const project = useProject()
  const sync = useSync()

  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = createMemo(() => {
    const id = session()?.workspaceID
    return id ? project.workspace.get(id) : undefined
  })

  const cwd = createMemo(() => {
    const dir = process.cwd()
    const parts = dir.split("/")
    return parts[parts.length - 1] ?? dir
  })

  const branch = createMemo(() => getGitBranch())
  const gitStatus = createMemo(() => getGitStatus())

  const framework = createMemo(() => {
    try {
      const pkg = require(process.cwd() + "/package.json")
      if (pkg.dependencies?.next || pkg.devDependencies?.next) return "Next.js"
      if (pkg.dependencies?.react || pkg.devDependencies?.react) return "React"
      if (pkg.dependencies?.vue || pkg.devDependencies?.vue) return "Vue"
      if (pkg.dependencies?.svelte || pkg.devDependencies?.svelte) return "Svelte"
      if (pkg.dependencies?.express || pkg.devDependencies?.express) return "Express"
      return "Node.js"
    } catch {
      return "TypeScript"
    }
  })

  return (
    <box gap={0}>
      <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
        <text fg={theme.secondary}>⬡</text>
        <text fg={theme.text}>
          <b>PROJECT OVERVIEW</b>
        </text>
      </box>
      <box paddingLeft={1} gap={0}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Project:</text>
          <text fg={theme.text}>{cwd()}</text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Framework:</text>
          <text fg={theme.info}>{framework()}</text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Branch:</text>
          <text fg={theme.success}>⎇ {branch()}</text>
        </box>
        <Show when={gitStatus()}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.textMuted}>Git:</text>
            <text fg={gitStatus() === "clean" ? theme.success : theme.warning}>{gitStatus()}</text>
          </box>
        </Show>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Time:</text>
          <Clock />
        </box>
      </box>
    </box>
  )
}

function GamificationPanel() {
  const { theme } = useTheme()
  const gami = useGamification()

  const pct = createMemo(() => gami.xpIntoLevel() / gami.xpNeeded())
  const barWidth = WIDTH - 8
  const xpBar = createMemo(() => bar(pct(), barWidth))

  const motivational = createMemo(() => {
    const lvl = gami.level()
    if (lvl >= 20) return "You're legendary! 🔥"
    if (lvl >= 15) return "Elite coder status!"
    if (lvl >= 10) return "Keep coding, legend!"
    if (lvl >= 5) return "On a roll!"
    return "Keep it up! 💪"
  })

  return (
    <box gap={0}>
      <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
        <text fg={theme.warning}>★</text>
        <text fg={theme.text}>
          <b>GAMIFICATION</b>
        </text>
      </box>
      <box paddingLeft={1} gap={0}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Level</text>
          <text fg={theme.primary}>
            <b>{gami.level()}</b>
          </text>
        </box>
        <box>
          <text fg={theme.primary}>{xpBar()}</text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}></text>
          <text fg={theme.textMuted}>
            {gami.xpIntoLevel()}/{gami.xpNeeded()} XP
          </text>
        </box>
        <box height={1} />
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>STREAK</text>
          <text fg={theme.warning}>
            <b>{gami.data().streak}</b>
            <span style={{ fg: theme.textMuted }}> days</span>
          </text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>QUESTS</text>
          <text fg={theme.info}>
            <b>{gami.completedQuests()}</b>
            <span style={{ fg: theme.textMuted }}>/{gami.totalQuests()}</span>
          </text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>POINTS</text>
          <text fg={theme.success}>
            <b>{gami.data().xp.toLocaleString()}</b>
          </text>
        </box>
        <box height={1} />
        <text fg={theme.primary}>{motivational()}</text>
      </box>
    </box>
  )
}

export function LeftSidebar(props: { sessionID: string }) {
  const { theme } = useTheme()

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={WIDTH}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      flexShrink={0}
    >
      <scrollbox flexGrow={1}>
        <box flexShrink={0} gap={1} paddingRight={1}>
          <ModeNav />
          <Divider />
          <ProjectOverview sessionID={props.sessionID} />
          <Divider />
          <HarnessStatus sessionID={props.sessionID} />
          <Divider />
          <GamificationPanel />
        </box>
      </scrollbox>
    </box>
  )
}
