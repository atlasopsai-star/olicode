import { createMemo, Show, type Accessor } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useSync } from "../context/sync"
import { TodoItem } from "./todo-item"
import { ProofOfDone } from "./proof-of-done"
import { Spinner } from "./spinner"
import { usePalette } from "../util/palette"
import { useBindings } from "../keymap"

export type WorkspaceTab = "chat" | "plan" | "contract"

const TABS = [
  { id: "chat", label: "CHAT" },
  { id: "plan", label: "EXECUTION PLAN" },
  { id: "contract", label: "EXECUTION CONTRACT" },
] as const

// OliCode workspace tab bar — switch between the live conversation, the real
// todo-driven execution plan, and the execution contract view without leaving
// the session. Keyboard: ctrl+alt+1/2/3, or click a tab.
export function SessionTabs(props: { tab: Accessor<WorkspaceTab>; setTab: (tab: WorkspaceTab) => void }) {
  const palette = usePalette()
  const dimensions = useTerminalDimensions()
  const wide = createMemo(() => dimensions().width > 100)

  useBindings(() => ({
    bindings: TABS.map((tab, index) => ({
      key: `ctrl+alt+${index + 1}`,
      desc: `Open ${tab.label} tab`,
      group: "Workspace",
      cmd: () => props.setTab(tab.id),
    })),
  }))

  return (
    <box flexDirection="column" flexShrink={0}>
      <box flexDirection="row" alignItems="center" paddingLeft={1} paddingRight={1}>
        {TABS.map((tab) => {
          const active = () => props.tab() === tab.id
          return (
            <box
              onMouseUp={() => props.setTab(tab.id)}
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={active() ? palette.surface : undefined}
            >
              <text fg={active() ? palette.gold : palette.textSecondary}>{active() ? "▸ " : ""}{tab.label}</text>
            </box>
          )
        })}
        <box flexGrow={1} />
        <Show when={wide()}>
          <text fg={palette.textMuted}>ctrl+alt+1 · 2 · 3</text>
        </Show>
      </box>
      <box flexShrink={0} border={["bottom"]} borderColor={palette.border} />
    </box>
  )
}

function harnessMetadata(sync: ReturnType<typeof useSync>, sessionID: string) {
  const status = sync.data.session_status?.[sessionID] as { metadata?: Record<string, unknown> } | undefined
  return status?.metadata
}

export function ExecutionPlanView(props: { sessionID: string }) {
  const palette = usePalette()
  const sync = useSync()
  const dimensions = useTerminalDimensions()

  const todos = createMemo(() => sync.data.todo[props.sessionID] ?? [])
  const metadata = createMemo(() => harnessMetadata(sync, props.sessionID))
  const mode = createMemo(() => {
    const value = metadata()?.mode
    return typeof value === "string" ? value : undefined
  })
  const objective = createMemo(() => {
    const value = metadata()?.objective
    return typeof value === "string" && value ? value : undefined
  })
  const goal = createMemo(() => objective() ?? lastUserText(sync, props.sessionID))
  const done = createMemo(() => todos().filter((t) => t.status === "completed").length)
  const inProgress = createMemo(() => todos().filter((t) => t.status === "in_progress").length)
  const pct = createMemo(() => (todos().length === 0 ? 0 : done() / todos().length))
  const complete = createMemo(() => todos().length > 0 && done() === todos().length)
  const sessionStatus = createMemo(() => sync.session.status(props.sessionID))
  const working = createMemo(() => sessionStatus() === "working")
  const compacting = createMemo(() => sessionStatus() === "compacting")
  const barWidth = createMemo(() => Math.max(10, Math.min(36, dimensions().width - 40)))

  return (
    <scrollbox flexGrow={1}>
      <box flexShrink={0} gap={1}>
        <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
          <text fg={palette.gold}>▣</text>
          <text fg={palette.text}>
            <b>EXECUTION PLAN</b>
          </text>
          <Show when={mode()}>
            <text fg={palette.purple}>{String(mode()).toUpperCase()}</text>
          </Show>
          <box flexGrow={1} />
          <Show when={working()} fallback={<text fg={compacting() ? palette.warning : palette.textMuted}>{compacting() ? "▸ COMPACTING" : "○ IDLE"}</text>}>
            <Spinner color={palette.gold}>WORKING</Spinner>
          </Show>
        </box>

        <box paddingLeft={1} gap={0}>
          <text fg={palette.textMuted}>GOAL</text>
          <Show when={goal()} fallback={<text fg={palette.textMuted}>— no active goal yet</text>}>
            <text fg={palette.text} wrapMode="word">
              {goal()}
            </text>
          </Show>
        </box>

        <Show when={todos().length > 0}>
          <box paddingLeft={1} gap={1}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={palette.textMuted}>
                {done()} / {todos().length} done
              </text>
              <Show when={inProgress() > 0}>
                <text fg={palette.warning}>{inProgress()} in progress</text>
              </Show>
            </box>
            <box flexDirection="row" gap={1} alignItems="center">
              <ProgressBar pct={pct()} width={barWidth()} />
              <text fg={complete() ? palette.success : palette.gold}>{Math.round(pct() * 100)}%</text>
            </box>
            <Show when={complete()}>
              <text fg={palette.success}>✓ ALL TASKS COMPLETE</text>
            </Show>
          </box>
        </Show>

        <box paddingLeft={1} gap={0}>
          <Show when={todos().length === 0} fallback={<>{todos().map((t) => <TodoItem status={t.status} content={t.content} />)}</>}>
            <text fg={palette.textMuted}>No plan yet — ask the agent to plan or use /plan.</text>
          </Show>
        </box>
      </box>
    </scrollbox>
  )
}

export function ExecutionContractView(props: { sessionID: string }) {
  const palette = usePalette()
  const sync = useSync()

  const session = createMemo(() => sync.session.get(props.sessionID))
  const metadata = createMemo(() => harnessMetadata(sync, props.sessionID))
  const objective = createMemo(() => {
    const value = metadata()?.objective
    return typeof value === "string" && value ? value : undefined
  })
  const goal = createMemo(() => objective() ?? lastUserText(sync, props.sessionID))
  const directory = createMemo(() => session()?.directory ?? process.cwd())

  return (
    <scrollbox flexGrow={1}>
      <box flexShrink={0} gap={1}>
        <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
          <text fg={palette.purple}>◈</text>
          <text fg={palette.text}>
            <b>EXECUTION CONTRACT</b>
          </text>
        </box>

        <box paddingLeft={1} gap={0}>
          <text fg={palette.textMuted}>GOAL</text>
          <Show when={goal()} fallback={<text fg={palette.textMuted}>— no active goal yet</text>}>
            <text fg={palette.text} wrapMode="word">
              {goal()}
            </text>
          </Show>

          <box height={1} />
          <text fg={palette.textMuted}>SCOPE</text>
          <text fg={palette.text} wrapMode="word">
            {directory()}
          </text>

          <box height={1} />
          <text fg={palette.textMuted}>LOCKED</text>
          <text fg={palette.textMuted}>— no scope locked yet</text>

          <box height={1} />
          <text fg={palette.textMuted}>SUCCESS</text>
          <ProofOfDone sessionID={props.sessionID} />
        </box>

        <box paddingLeft={1}>
          <text fg={palette.textMuted}>
            Contract finalizes once a plan is accepted. Current state is live session data — nothing here is simulated.
          </text>
        </box>
      </box>
    </scrollbox>
  )
}

function lastUserText(sync: ReturnType<typeof useSync>, sessionID: string): string | undefined {
  const messages = sync.data.message[sessionID] ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== "user") continue
    const parts = sync.data.part[message.id] ?? []
    const text = parts
      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text" && !p.synthetic)
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join(" ")
    if (text) return text
  }
  return undefined
}

// Two-tone live progress bar: gold fill while the plan runs, green when the
// last todo lands. The track stays muted so the fill reads at a glance.
// Reads run through memos so the fill genuinely updates as todos land — the
// same guarantee the parent gets by calling pct() directly in JSX.
function ProgressBar(props: { pct: number; width: number }) {
  const palette = usePalette()
  const filled = createMemo(() => Math.round(Math.min(1, Math.max(0, props.pct)) * props.width))
  const complete = createMemo(() => props.pct >= 1)
  return (
    <box flexDirection="row">
      <text fg={complete() ? palette.success : palette.gold}>{"█".repeat(filled())}</text>
      <text fg={palette.textMuted}>{"░".repeat(props.width - filled())}</text>
    </box>
  )
}
