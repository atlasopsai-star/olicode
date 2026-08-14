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
