import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { execSync } from "child_process"
import { useTheme } from "../../context/theme"
import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { useGamification } from "../../context/gamification"

function getGitBranch(): string {
  try {
    return execSync("git branch --show-current 2>/dev/null", { encoding: "utf8", timeout: 2000 }).trim() || "main"
  } catch {
    return "main"
  }
}

function getGitStatus(): string {
  try {
    const out = execSync("git status --porcelain 2>/dev/null", { encoding: "utf8", timeout: 2000 })
    const lines = out.trim().split("\n").filter(Boolean)
    if (!lines.length) return "clean"
    return `${lines.length} changed`
  } catch {
    return ""
  }
}

const WIDTH = 26

function bar(pct: number, width: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, pct)) * width)
  const empty = width - filled
  return "█".repeat(filled) + "░".repeat(empty)
}

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

const COMMANDS = [
  { key: "n", label: "New Chat" },
  { key: "r", label: "Run Command" },
  { key: "o", label: "Open File" },
  { key: "s", label: "Search Code" },
  { key: "m", label: "Change Model" },
  { key: ",", label: "Settings" },
  { key: "?", label: "Help" },
  { key: "q", label: "Quit" },
]

function CommandCenter() {
  const { theme } = useTheme()
  return (
    <box gap={0}>
      <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
        <text fg={theme.primary}>◈</text>
        <text fg={theme.text}>
          <b>COMMAND CENTER</b>
        </text>
      </box>
      {COMMANDS.map((cmd) => (
        <box flexDirection="row" justifyContent="space-between" paddingLeft={1}>
          <text fg={theme.textMuted}>{">> "}{cmd.label}</text>
          <text fg={theme.primary}>[{cmd.key}]</text>
        </box>
      ))}
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
          <CommandCenter />
          <Divider />
          <ProjectOverview sessionID={props.sessionID} />
          <Divider />
          <GamificationPanel />
        </box>
      </scrollbox>
    </box>
  )
}
