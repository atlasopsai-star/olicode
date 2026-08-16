import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { RGBA } from "@opentui/core"
import { useTheme, tint } from "../context/theme"
import { useKV } from "../context/kv"
import { Spinner } from "./spinner"
import { buildLinearSweep, defaultShimmerConfig, sweepEnvelope, type ShimmerConfig } from "../util/shimmer"

// OliCode startup splash — the brand identity moment between `olicode` and the
// workspace. Renders the block-letter wordmark centered on the terminal, then
// runs a gold shimmer sweep: a bright band with a soft trail travels left to
// right across the letters, lighting each one in sequence before settling into
// settled gold and clearing into the home screen.
// Never delays work: the splash holds at most MIN_SPLASH ms and vanishes as
// soon as startup finishes past that point.

const WORDMARK = [
  " ██████╗ ██╗     ██╗ ██████╗ ██████╗ ██████╗ ███████╗",
  "██╔═══██╗██║     ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  "██║   ██║██║     ██║██║     ██║   ██║██║  ██║█████╗",
  "██║   ██║██║     ██║██║     ██║   ██║██║  ██║██╔══╝",
  "╚██████╔╝███████╗██║╚██████╗╚██████╔╝██████╔╝███████╗",
  " ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
] as const

const WIDTH = WORDMARK[0]!.length

const MIN_SPLASH = 1300
const SETTLE = 300
const SWEEP_MS = 1000
const PEAK = RGBA.fromInts(255, 255, 255)

// Linear sweep tuned for the startup moment: a tight bright core with a soft
// halo and a short trailing glow, resting just above pure gold until the sweep
// completes. Shares the envelope with the home logo's idle shimmer.
const SPLASH_SWEEP: ShimmerConfig = {
  ...defaultShimmerConfig,
  coreWidth: 2.9,
  coreAmp: 0.95,
  softWidth: 9,
  softAmp: 0.12,
  tail: 7,
  tailAmp: 0.4,
  haloWidth: 3.2,
  haloOffset: 0.6,
  haloAmp: 0.06,
  breathBase: 0.14,
  noise: 0,
  primaryMix: 0,
}

export function StartupSplash(props: { ready: () => boolean }) {
  const theme = useTheme().theme
  const kv = useKV()
  const [show, setShow] = createSignal(true)
  const [sweep, setSweep] = createSignal(0)
  const text = createMemo(() => (props.ready() ? "Finishing startup..." : "Loading plugins..."))
  const started = Date.now()
  let settled = false
  let timer: ReturnType<typeof setInterval> | undefined
  let hold: ReturnType<typeof setTimeout> | undefined

  const stopSweep = () => {
    if (timer) {
      clearInterval(timer)
      timer = undefined
    }
  }

  createEffect(() => {
    if (!kv.get("animations_enabled", true)) {
      stopSweep()
      if (!settled) {
        settled = true
        setSweep(1)
      }
      return
    }
    if (timer || settled) return
    const stamp = Date.now()
    timer = setInterval(() => {
      const p = (Date.now() - stamp) / SWEEP_MS
      if (p >= 1) {
        stopSweep()
        settled = true
        setSweep(1)
      } else {
        setSweep(p)
      }
    }, 16)
  })

  createEffect(() => {
    if (!props.ready() || !show() || hold) return
    const left = MIN_SPLASH - (Date.now() - started)
    hold = setTimeout(() => {
      hold = undefined
      stopSweep()
      setShow(false)
    }, left > 0 ? left : SETTLE).unref()
  })

  onCleanup(() => {
    stopSweep()
    if (hold) clearTimeout(hold)
  })

  // Shimmer sweep envelope: the shared sweep drives a single head from off the
  // left edge to off the right edge. Each letter at column x lights up as the
  // head passes, held just above pure gold by the resting breath until the
  // sweep completes, at which point the wordmark settles into theme gold.
  const sweepState = createMemo(() => buildLinearSweep(sweep(), SPLASH_SWEEP, WIDTH))
  const colorFor = (x: number) => {
    if (sweep() >= 1) return theme.primary
    const env = sweepEnvelope(x + 0.5, sweepState())
    return tint(theme.primary, PEAK, Math.min(1, env.glow + env.peak))
  }

  return (
    <Show when={show()}>
      <box
        position="absolute"
        zIndex={5000}
        left={0}
        right={0}
        top={0}
        bottom={0}
        backgroundColor={theme.background}
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
      >
        <box flexDirection="column" gap={0} alignItems="center">
          {WORDMARK.map((line) => (
            <box flexDirection="row">
              {Array.from(line).map((char, x) =>
                char === " " ? <text>{" "}</text> : <text fg={colorFor(x)}>{char}</text>,
              )}
            </box>
          ))}
          <box height={1} />
          <text fg={theme.textMuted}>PREMIUM AI CODING COMMAND CENTER</text>
          <Spinner color={theme.textMuted}>{text()}</Spinner>
        </box>
      </box>
    </Show>
  )
}
