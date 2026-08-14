import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Logo } from "../component/logo"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "@/cli/cmd/tui/plugin/runtime"
import { useEditorContext } from "@tui/context/editor"
import { useTerminalDimensions } from "@opentui/solid"
import { useTuiConfig } from "../context/tui-config"

let once = false
const placeholder = {
  normal: [
    "Build me a full-stack web app and deploy to Vercel",
    "Fix all TypeScript errors in this project",
    "Review this PR and suggest improvements",
    "Create a REST API with authentication",
    "Analyze and optimize my database queries",
  ],
  shell: ["ls -la", "git status", "pwd"],
}

function Clock() {
  const { theme } = useTheme()
  const [now, setNow] = createSignal(new Date())
  onMount(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    onCleanup(() => clearInterval(id))
  })
  const display = createMemo(() => {
    const d = now()
    const t = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    const dt = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    return `${t} · ${dt}`
  })
  return (
    <text fg={theme.primary}>
      <b>{display()}</b>
    </text>
  )
}

function StatusBar(props: { ready: boolean; width: number }) {
  const { theme } = useTheme()
  const workspace = createMemo(() => {
    const cwd = process.cwd()
    const home = process.env.HOME ?? ""
    return cwd.replace(home, "~")
  })
  return (
    <box flexDirection="row" gap={2} alignItems="center" justifyContent="center" paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={props.ready ? theme.success : theme.warning}>{props.ready ? "●" : "○"}</text>
        <text fg={theme.textMuted}>{props.ready ? "READY" : "CONNECTING"}</text>
      </box>
      <text fg={theme.border}>│</text>
      <Clock />
      <Show when={props.width >= 86}>
        <text fg={theme.border}>│</text>
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.primary}>⌁</text>
          <text fg={theme.textMuted}>{workspace()}</text>
        </box>
      </Show>
    </box>
  )
}

export function Home() {
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const editor = useEditorContext()
  const dimensions = useTerminalDimensions()
  const tuiConfig = useTuiConfig()
  const { theme } = useTheme()
  const promptMaxWidth = createMemo(() => {
    const configured = tuiConfig.prompt?.max_width
    if (configured === "auto") return Math.max(75, Math.floor(dimensions().width * 0.7))
    return configured ?? 75
  })
  let sent = false

  onMount(() => {
    editor.clearSelection()
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.prompt) {
      r.set(route.prompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box height={3} minHeight={0} flexShrink={1} />

        {/* Logo + hero block */}
        <box flexShrink={0} alignItems="center">
          <TuiPluginRuntime.Slot name="home_logo" mode="replace">
            <Logo idle />
          </TuiPluginRuntime.Slot>
          <box alignItems="center" paddingTop={1}>
            <text fg={theme.primary}>
              <b>Premium AI Coding Command Center</b>
            </text>
          </box>
          <box alignItems="center">
            <text fg={theme.textMuted}>AI coding, design, and shipping workspace</text>
          </box>
        </box>

        {/* Live status bar */}
        <box flexShrink={0} alignItems="center" width="100%">
          <StatusBar ready={sync.ready} width={dimensions().width} />
        </box>

        {/* Separator */}
        <box flexShrink={0} alignItems="center" paddingBottom={1}>
          <text fg={theme.border}>
            {"─".repeat(Math.min(60, dimensions().width - 8))}
          </text>
        </box>

        {/* Quick-launch commands */}
        <box flexShrink={0} alignItems="center" flexDirection="row" gap={2} justifyContent="center" paddingBottom={1}>
          <text>
            <span style={{ fg: theme.primary }}>⌘</span>
            <span style={{ fg: theme.textMuted }}> /new</span>
            <span style={{ fg: theme.border }}> session</span>
          </text>
          <text fg={theme.borderActive}>·</text>
          <text>
            <span style={{ fg: theme.primary }}>⌘</span>
            <span style={{ fg: theme.textMuted }}> /models</span>
            <span style={{ fg: theme.border }}> switch</span>
          </text>
          <Show when={dimensions().width >= 96}>
            <text fg={theme.borderActive}>·</text>
            <text>
              <span style={{ fg: theme.primary }}>⌘</span>
              <span style={{ fg: theme.textMuted }}> /connect</span>
              <span style={{ fg: theme.border }}> providers</span>
            </text>
            <text fg={theme.borderActive}>·</text>
            <text>
              <span style={{ fg: theme.primary }}>⌘</span>
              <span style={{ fg: theme.textMuted }}> /themes</span>
              <span style={{ fg: theme.border }}> style</span>
            </text>
          </Show>
        </box>

        {/* Prompt */}
        <box width="100%" maxWidth={promptMaxWidth()} zIndex={1000} paddingTop={1} flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_prompt" mode="replace" ref={bind}>
            <Prompt ref={bind} right={<TuiPluginRuntime.Slot name="home_prompt_right" />} placeholders={placeholder} />
          </TuiPluginRuntime.Slot>
        </box>
        <TuiPluginRuntime.Slot name="home_bottom" />
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </>
  )
}
