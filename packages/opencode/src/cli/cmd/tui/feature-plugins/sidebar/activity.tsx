import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, For, Show } from "solid-js"

const id = "internal:sidebar-activity"

function timeAgo(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const diff = createMemo(() => props.api.state.session.diff(props.session_id))

  const msgs = createMemo(() => {
    const all = props.api.state.session.messages(props.session_id)
    return all.filter((m: any) => m.role === "assistant" && m.time?.completed).slice(-5).reverse()
  })

  return (
    <Show when={msgs().length > 0}>
      <box gap={0}>
        <box flexDirection="row" gap={1} alignItems="center" marginBottom={1}>
          <text fg={theme().info}>⚡</text>
          <text fg={theme().text}>
            <b>RECENT ACTIVITY</b>
          </text>
        </box>
        <box paddingLeft={1} gap={0}>
          <For each={diff().slice(0, 5)}>
            {(item) => (
              <box flexDirection="row" justifyContent="space-between" gap={1}>
                <text fg={theme().textMuted} wrapMode="none">
                  {"  "}
                  {item.file.split("/").pop()}
                </text>
                <box flexDirection="row" gap={0} flexShrink={0}>
                  <Show when={item.additions}>
                    <text fg={theme().diffAdded}>+{item.additions}</text>
                  </Show>
                  <Show when={item.deletions}>
                    <text fg={theme().diffRemoved}>-{item.deletions}</text>
                  </Show>
                </box>
              </box>
            )}
          </For>
        </box>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 300,
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
