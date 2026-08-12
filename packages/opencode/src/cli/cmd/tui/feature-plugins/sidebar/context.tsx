import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, Show } from "solid-js"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
})

function shortNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
  return n.toLocaleString()
}

// Renders a simple ASCII progress bar fitting within `width` chars
function bar(pct: number, width: number, fg: string, bg: string): string {
  const filled = Math.round(Math.min(1, Math.max(0, pct / 100)) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

function Row(props: { label: string; value: string; theme: TuiThemeCurrent }) {
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={props.theme.textMuted}>{props.label}</text>
      <text fg={props.theme.text}>{props.value}</text>
    </box>
  )
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return null
    }

    const { input, output, reasoning, cache } = last.tokens
    const total = input + output + reasoning + cache.read + cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const limit = model?.limit.context ?? 0
    const percent = limit > 0 ? Math.round((total / limit) * 100) : null

    return { input, output, reasoning, cacheRead: cache.read, cacheWrite: cache.write, total, percent, limit }
  })

  const pctColor = createMemo(() => {
    const pct = state()?.percent ?? 0
    if (pct >= 85) return theme().error
    if (pct >= 60) return theme().warning
    return theme().success
  })

  return (
    <box gap={1}>
      <text fg={theme().text}>
        <b>Usage</b>
      </text>

      <Show when={state()} fallback={<text fg={theme().textMuted}>No messages yet</text>}>
        {(s) => (
          <box gap={1}>
            {/* Context bar */}
            <Show when={s().percent !== null}>
              <box>
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme().textMuted}>Context</text>
                  <text fg={pctColor()}>{s().percent}%</text>
                </box>
                <text fg={pctColor()}>{bar(s().percent ?? 0, 34, "", "")}</text>
              </box>
            </Show>

            {/* Token breakdown */}
            <box gap={0}>
              <Row label="  Input" value={shortNum(s().input)} theme={theme()} />
              <Row label="  Output" value={shortNum(s().output)} theme={theme()} />
              <Show when={s().reasoning > 0}>
                <Row label="  Thinking" value={shortNum(s().reasoning)} theme={theme()} />
              </Show>
              <Show when={s().cacheRead > 0 || s().cacheWrite > 0}>
                <Row label="  Cache ↓" value={shortNum(s().cacheRead)} theme={theme()} />
                <Row label="  Cache ↑" value={shortNum(s().cacheWrite)} theme={theme()} />
              </Show>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme().text}>
                  <b>Total</b>
                </text>
                <text fg={theme().text}>
                  <b>{shortNum(s().total)}</b>
                </text>
              </box>
            </box>
          </box>
        )}
      </Show>

      {/* Cost */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().textMuted}>Session cost</text>
        <text fg={cost() > 0 ? theme().text : theme().textMuted}>
          <b>{money.format(cost())}</b>
        </text>
      </box>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
