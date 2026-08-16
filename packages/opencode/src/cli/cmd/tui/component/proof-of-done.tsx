import { createMemo } from "solid-js"
import { useTheme } from "../context/theme"
import { useSync } from "../context/sync"
import type { ToolPart } from "@opencode-ai/sdk/v2"

// Proof of Done — real verification state for the current session.
// Every row is derived from completed `bash` tool parts: the command the agent
// actually ran, its real exit code, duration, and (for tests) parsed pass count.
// Nothing here is fabricated — if a check was never run it renders "— not run".

type CheckStatus = "pass" | "fail" | "done" | "not-run"

type CheckState = {
  status: CheckStatus
  seconds?: number
  count?: number
}

type CheckDef = { id: string; label: string; pattern: RegExp }

const CHECK_DEFS: CheckDef[] = [
  { id: "typecheck", label: "TYPECHECK", pattern: /\b(tsc|tsgo)\b|typecheck/ },
  {
    id: "build",
    label: "BUILD",
    pattern: /\b(bun|npm|pnpm|yarn|npx|turbo)\s+run\s+(build|bundle)\b|(^|\s)(next|vite)\s+build(\s|$)/,
  },
  {
    id: "tests",
    label: "TESTS",
    pattern: /\b(bun|npm|pnpm|yarn|npx)\s+(run\s+)?(test|test:ci)\b|vitest|jest|playwright\s+test|pytest/,
  },
]

function parseTestCount(output: string): number | undefined {
  const testsLine = output.match(/Tests?\s*:?\s*(\d+)\s+passed/)
  if (testsLine) return Number(testsLine[1])
  const plain = output.match(/(\d+)\s+(?:passed|pass)\b/)
  if (plain) return Number(plain[1])
  return undefined
}

function completedBashParts(parts: unknown[]): ToolPart[] {
  return parts.filter(
    (p): p is ToolPart =>
      typeof p === "object" &&
      p !== null &&
      (p as ToolPart).type === "tool" &&
      (p as ToolPart).tool === "bash" &&
      (p as ToolPart).state.status === "completed",
  )
}

export function ProofOfDone(props: { sessionID: string }) {
  const { theme } = useTheme()
  const sync = useSync()

  const checks = createMemo(() => {
    const messages = sync.data.message[props.sessionID] ?? []
    const parts = messages.flatMap((m) => sync.data.part[m.id] ?? [])
    const bash = completedBashParts(parts)
    const result: Record<string, CheckState> = {}

    for (const def of CHECK_DEFS) {
      const matches = bash.filter((p) => {
        const input = (p.state as { input?: { command?: string } }).input
        return def.pattern.test(input?.command ?? "")
      })
      const last = matches.at(-1)
      if (!last) {
        result[def.id] = { status: "not-run" }
        continue
      }
      const state = last.state
      if (state.status !== "completed") {
        result[def.id] = { status: "not-run" }
        continue
      }
      const metadata = state.metadata as { exit?: number | null } | undefined
      const time = (state as { time?: { start?: number; end?: number } }).time
      const seconds =
        time?.start != null && time?.end != null ? Number(((time.end - time.start) / 1000).toFixed(1)) : undefined
      const exit = metadata?.exit
      result[def.id] = {
        status: exit === 0 ? "pass" : typeof exit === "number" ? "fail" : "done",
        seconds,
        count: def.id === "tests" ? parseTestCount(String(state.output ?? "")) : undefined,
      }
    }
    return result
  })

  const summary = createMemo(() => {
    const ran = CHECK_DEFS.map((def) => checks()[def.id]).filter((c) => c.status !== "not-run")
    if (ran.length === 0) return { label: "No verification run yet", color: theme.textMuted }
    const allPass = ran.every((c) => c.status === "pass")
    return {
      label: allPass ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED",
      color: allPass ? theme.success : theme.error,
    }
  })

  const statusText = (c: CheckState) => {
    if (c.status === "pass") return `✓ PASS${c.count !== undefined ? ` ${c.count}` : ""}${c.seconds !== undefined ? ` ${c.seconds}s` : ""}`
    if (c.status === "fail") return `✗ FAIL${c.seconds !== undefined ? ` ${c.seconds}s` : ""}`
    if (c.status === "done") return "done (no exit code)"
    return "— not run"
  }

  const statusColor = (c: CheckState) => {
    if (c.status === "pass") return theme.success
    if (c.status === "fail") return theme.error
    if (c.status === "done") return theme.info
    return theme.textMuted
  }

  return (
    <box gap={0}>
      <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
        <text fg={theme.success}>✓</text>
        <text fg={theme.text}>
          <b>PROOF OF DONE</b>
        </text>
      </box>
      <box paddingLeft={1} gap={0}>
        {CHECK_DEFS.map((def) => {
          const c = checks()[def.id]
          return (
            <box flexDirection="row" justifyContent="space-between">
              <text fg={theme.textMuted}>{def.label}</text>
              <text fg={statusColor(c)}>{statusText(c)}</text>
            </box>
          )
        })}
      </box>
      <box paddingLeft={1} marginTop={1}>
        <text fg={summary().color}>
          <b>{summary().label}</b>
        </text>
      </box>
    </box>
  )
}
