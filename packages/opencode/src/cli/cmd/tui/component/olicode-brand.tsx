import { Show } from "solid-js"
import { useTheme } from "../context/theme"

export function OliCodeWordmark(props: { muted?: boolean; compact?: boolean } = {}) {
  const { theme } = useTheme()
  return (
    <text fg={props.muted ? theme.textMuted : theme.text} wrapMode="none">
      <span style={{ fg: theme.primary, bold: true }}>OLI</span>
      <span style={{ bold: true }}>CODE</span>
      <Show when={!props.compact}>
        <span style={{ fg: theme.borderActive }}> / WORKSPACE</span>
      </Show>
    </text>
  )
}

export function OliCodeSectionTitle(props: { children: string; tone?: "primary" | "secondary" }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" gap={1} alignItems="center">
      <text fg={props.tone === "secondary" ? theme.secondary : theme.primary}>━</text>
      <text fg={theme.text} wrapMode="none">
        <b>{props.children}</b>
      </text>
    </box>
  )
}

export function OliCodeStatus(props: {
  label: string
  tone?: "idle" | "active" | "success" | "warning" | "error"
}) {
  const { theme } = useTheme()
  const color = () => {
    if (props.tone === "active") return theme.primary
    if (props.tone === "success") return theme.success
    if (props.tone === "warning") return theme.warning
    if (props.tone === "error") return theme.error
    return theme.textMuted
  }
  return (
    <box flexDirection="row" gap={1} alignItems="center">
      <text fg={color()}>{props.tone === "active" ? "◆" : props.tone === "idle" ? "○" : "●"}</text>
      <text fg={color()} wrapMode="none">
        <b>{props.label}</b>
      </text>
    </box>
  )
}
