import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { execSync } from "child_process"
import { useTheme } from "../../context/theme"
import { useProject } from "@tui/context/project"
import { useSync } from "@tui/context/sync"
import { useGamification } from "../../context/gamification"
import { OliCodeSectionTitle, OliCodeWordmark } from "../../component/olicode-brand"
import { useCommandShortcut } from "../../keymap"

function getGitBranch(): string {
  try {
    return execSync("git branch --show-current 2>/dev/null", { encoding: "utf8", timeout: 2000 }).trim()
  } catch {
    return ""
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

function CommandCenter() {
  const { theme } = useTheme()
  const commands = [
    { key: useCommandShortcut("session.new"), label: "New session" },
    { key: useCommandShortcut("command.palette.show"), label: "Commands" },
    { key: useCommandShortcut("model.list"), label: "Models" },
    { key: useCommandShortcut("session.list"), label: "Sessions" },
    { key: useCommandShortcut("help.show"), label: "Help" },
  ]
  return (
    <box gap={0}>
      <box marginBottom={1}>
        <OliCodeSectionTitle>COMMANDS</OliCodeSectionTitle>
      </box>
      {commands.map((cmd) => (
        <box flexDirection="row" justifyContent="space-between" paddingLeft={1}>
          <text fg={theme.textMuted}>{cmd.label}</text>
          <text fg={theme.primary}>{cmd.key()}</text>
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
      return pkg.name ? "Node.js" : ""
    } catch {
      return ""
    }
  })

  return (
    <box gap={0}>
      <box marginBottom={1}>
        <OliCodeSectionTitle tone="secondary">PROJECT</OliCodeSectionTitle>
      </box>
      <box paddingLeft={1} gap={0}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Project:</text>
          <text fg={theme.text}>{cwd()}</text>
        </box>
        <Show when={framework()}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.textMuted}>Stack:</text>
            <text fg={theme.info}>{framework()}</text>
          </box>
        </Show>
        <Show when={branch()}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.textMuted}>Branch:</text>
            <text fg={theme.success}>⎇ {branch()}</text>
          </box>
        </Show>
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

  return (
    <box gap={0}>
      <box marginBottom={1}>
        <OliCodeSectionTitle>PROGRESS</OliCodeSectionTitle>
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
      border={["right"]}
      borderColor={theme.borderSubtle}
    >
      <scrollbox flexGrow={1}>
        <box flexShrink={0} gap={1} paddingRight={1}>
          <OliCodeWordmark />
          <Divider />
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
