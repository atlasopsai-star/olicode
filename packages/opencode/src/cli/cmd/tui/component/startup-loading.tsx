import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { Spinner } from "./spinner"
import { OliCodeWordmark } from "./olicode-brand"

const MINIMUM_DISPLAY_MS = 1000

export function StartupLoading(props: { ready: () => boolean }) {
  const theme = useTheme().theme
  const [show, setShow] = createSignal(true)
  const text = createMemo(() => (props.ready() ? "Finishing startup..." : "Loading plugins..."))
  let hold: NodeJS.Timeout | undefined
  const stamp = Date.now()

  createEffect(() => {
    if (props.ready()) {
      if (!show()) return
      if (hold) return

      const left = MINIMUM_DISPLAY_MS - (Date.now() - stamp)
      if (left <= 0) {
        setShow(false)
        return
      }

      hold = setTimeout(() => {
        hold = undefined
        setShow(false)
      }, left).unref()
      return
    }

    if (hold) {
      clearTimeout(hold)
      hold = undefined
    }
  })

  onCleanup(() => {
    if (hold) clearTimeout(hold)
  })

  return (
    <Show when={show()}>
      <box
        position="absolute"
        zIndex={5000}
        top={0}
        bottom={0}
        left={0}
        right={0}
        backgroundColor={theme.background}
        justifyContent="center"
        alignItems="center"
      >
        <box
          paddingLeft={2}
          paddingRight={2}
          alignItems="center"
          gap={1}
        >
          <OliCodeWordmark variant="hero" />
          <text fg={theme.primary} wrapMode="none">
            <b>PREMIUM AI CODING COMMAND CENTER</b>
          </text>
          <Spinner color={theme.primary}>{text()}</Spinner>
        </box>
      </box>
    </Show>
  )
}
