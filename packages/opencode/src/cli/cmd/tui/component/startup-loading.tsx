import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { Spinner } from "./spinner"
import { OliCodeWordmark } from "./olicode-brand"

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

      const left = 3000 - (Date.now() - stamp)
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
      <box position="absolute" zIndex={5000} left={0} right={0} bottom={1} justifyContent="center" alignItems="center">
        <box
          backgroundColor={theme.backgroundPanel}
          border={["top", "bottom"]}
          borderColor={theme.borderSubtle}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          alignItems="center"
          gap={1}
        >
          <OliCodeWordmark variant="hero" />
          <Spinner color={theme.primary}>{text()}</Spinner>
        </box>
      </box>
    </Show>
  )
}
