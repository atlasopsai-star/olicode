import { For } from "solid-js"
import { logo, type LogoShape } from "@/cli/logo"
import { Logo } from "./logo"
import { tint, useTheme } from "../context/theme"

export type OliCodeWordmarkVariant = "hero" | "header" | "compact" | "micro"

const pixels = (shape: string[]) =>
  shape.flatMap((line) => [
    Array.from(line).map((char) => (char === "█" || char === "▀" || char === "^" ? 1 : 0)),
    Array.from(line).map((char) => (char === "█" || char === "▄" ? 1 : 0)),
  ])

const collapse = (rows: number[][]) =>
  Array.from({ length: Math.ceil(rows.length / 2) }, (_, y) =>
    rows[y * 2].map((cell, x) => (cell || rows[y * 2 + 1]?.[x] ? 1 : 0)),
  )

const braille = (rows: number[][]) =>
  Array.from({ length: Math.ceil(rows.length / 4) }, (_, y) => {
    const line = Array.from({ length: Math.ceil(rows[0].length / 2) }, (_, x) => {
      const points = [
        [0, 0, 1],
        [0, 1, 2],
        [0, 2, 4],
        [1, 0, 8],
        [1, 1, 16],
        [1, 2, 32],
        [0, 3, 64],
        [1, 3, 128],
      ] as const
      const value = points.reduce(
        (sum, [dx, dy, bit]) => sum + (rows[y * 4 + dy]?.[x * 2 + dx] ? bit : 0),
        0,
      )
      return value ? String.fromCodePoint(0x2800 + value) : " "
    }).join("")
    return line.trimEnd()
  })

const derived = {
  header: {
    left: braille(pixels(logo.left)),
    right: braille(pixels(logo.right)),
  },
  compact: {
    left: braille(collapse(pixels(logo.left))),
    right: braille(collapse(pixels(logo.right))),
  },
} satisfies Record<"header" | "compact", LogoShape>

export function OliCodeWordmark(
  props: { variant?: OliCodeWordmarkVariant; muted?: boolean; animated?: boolean } = {},
) {
  const { theme } = useTheme()
  const variant = () => props.variant ?? "compact"
  if (variant() === "hero") return <Logo idle={props.animated !== false} />
  if (variant() === "header") return <Logo shape={derived.header} idle={props.animated !== false} />
  if (variant() === "compact") return <Logo shape={derived.compact} idle={props.animated === true} />

  const left = () => tint(theme.background, theme.primary, props.muted ? 0.38 : 0.58)
  const gold = () => tint(theme.background, theme.primary, props.muted ? 0.52 : 0.92)
  const champagne = () => tint(theme.background, theme.secondary, props.muted ? 0.48 : 0.88)

  return (
    <box gap={0}>
      <For each={derived.compact.left}>
        {(line, index) => (
          <box flexDirection="row" gap={1}>
            <text fg={left()} wrapMode="none" selectable={false}>
              <b>{line}</b>
            </text>
            <text wrapMode="none" selectable={false}>
              <For each={Array.from(derived.compact.right[index()] ?? "")}>
                {(char, charIndex) => (
                  <span
                    style={{
                      fg:
                        charIndex() >= Math.floor(derived.compact.right[index()].length * 0.62)
                          ? champagne()
                          : gold(),
                      bold: true,
                    }}
                  >
                    {char}
                  </span>
                )}
              </For>
            </text>
          </box>
        )}
      </For>
    </box>
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
