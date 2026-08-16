// Shared shimmer math for the OliCode brand surfaces — the home logo and the
// startup splash run the same sweep envelope. The envelope computes per-cell
// brightness from the signed distance to each active sweep head (core, soft
// glow, trailing tail, halo, ambient ring). Surfaces differ only in how they
// position heads: the home logo orbits heads around its origin
// (buildSweepState), while the splash drives a single head across the
// wordmark once (buildLinearSweep).

export type ShimmerConfig = {
  period: number
  rings: number
  sweepFraction: number
  coreWidth: number
  coreAmp: number
  softWidth: number
  softAmp: number
  tail: number
  tailAmp: number
  haloWidth: number
  haloOffset: number
  haloAmp: number
  breathBase: number
  noise: number
  ambientAmp: number
  ambientCenter: number
  ambientWidth: number
  shadowMix: number
  primaryMix: number
  originX: number
  originY: number
}

export const defaultShimmerConfig: ShimmerConfig = {
  period: 4600,
  rings: 2,
  sweepFraction: 1,
  coreWidth: 1.2,
  coreAmp: 1.9,
  softWidth: 10,
  softAmp: 1.6,
  tail: 5,
  tailAmp: 0.64,
  haloWidth: 4.3,
  haloOffset: 0.6,
  haloAmp: 0.16,
  breathBase: 0.04,
  noise: 0.1,
  ambientAmp: 0.36,
  ambientCenter: 0.5,
  ambientWidth: 0.34,
  shadowMix: 0.1,
  primaryMix: 0.3,
  originX: 4.5,
  originY: 13.5,
}

export function clamp(n: number) {
  return Math.max(0, Math.min(1, n))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t)
}

export function ease(t: number) {
  const p = clamp(t)
  return p * p * (3 - 2 * p)
}

export function gauss(dist: number, width: number, power: number) {
  return Math.exp(-(Math.abs(dist / width) ** power))
}

export function noise(x: number, y: number, t: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + t * 0.043) * 43758.5453
  return n - Math.floor(n)
}

export type SweepHead = {
  head: number
  eased: number
  ambient: number
}

export type SweepState = {
  cfg: ShimmerConfig
  rings: number
  active: SweepHead[]
}

// Brightness envelope at a point `traveled` along the sweep axis. Returns the
// glow (soft body + tail), the peak (bright core + halo over a resting breath),
// and the primary-tinted fringe used by the logo's gold layers.
export function sweepEnvelope(traveled: number, state: SweepState) {
  const cfg = state.cfg
  let glow = 0
  let peak = 0
  let halo = 0
  let primary = 0
  let ambient = 0
  for (const item of state.active) {
    const delta = traveled - item.head
    // Use shallower exponents (1.8/1.6 vs 2) for softer edges on the Gaussians
    // so adjacent cells have smaller brightness deltas.
    const core = gauss(delta, cfg.coreWidth, 1.8)
    const soft = gauss(delta, cfg.softWidth, 1.6)
    const tailRange = cfg.tail * 2.6
    const tail = delta < 0 && delta > -tailRange ? (1 + delta / tailRange) ** 2.6 : 0
    const haloBand = gauss(delta + cfg.haloOffset, cfg.haloWidth, 1.6)
    glow += (soft * cfg.softAmp + tail * cfg.tailAmp) * item.eased
    peak += core * cfg.coreAmp * item.eased
    halo += haloBand * cfg.haloAmp * item.eased
    primary += (haloBand + tail * 0.6) * item.eased
    ambient += item.ambient
  }
  ambient /= state.rings
  return {
    glow: glow / state.rings,
    peak: cfg.breathBase + ambient + (peak + halo) / state.rings,
    primary: (primary / state.rings) * cfg.primaryMix,
  }
}

// Continuous orbiting sweep heads — the home logo's idle shimmer. Heads travel
// along the radius from the config origin toward the farthest corner, spaced
// over the config period with a sine pulse of intensity.
export function buildSweepState(t: number, cfg: ShimmerConfig, width: number, height: number): SweepState {
  const corners: [number, number][] = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ]
  let maxCorner = 0
  for (const [cx, cy] of corners) {
    const d = Math.hypot(cx - cfg.originX, cy - cfg.originY)
    if (d > maxCorner) maxCorner = d
  }
  const reach = maxCorner + cfg.tail * 2
  const rings = Math.max(1, Math.floor(cfg.rings))
  const active = [] as SweepHead[]
  for (let i = 0; i < rings; i++) {
    const offset = i / rings
    const cyclePhase = (t / cfg.period + offset) % 1
    if (cyclePhase >= cfg.sweepFraction) continue
    const phase = cyclePhase / cfg.sweepFraction
    const envelope = Math.sin(phase * Math.PI)
    const eased = envelope * envelope * (3 - 2 * envelope)
    const d = (phase - cfg.ambientCenter) / cfg.ambientWidth
    active.push({
      head: phase * reach,
      eased,
      ambient: Math.abs(d) < 1 ? (1 - d * d) ** 2 * cfg.ambientAmp : 0,
    })
  }
  return { cfg, rings, active }
}

// One-shot linear sweep — the startup splash. A single head travels from off
// the left edge to off the right edge as progress goes 0 -> 1, at constant
// intensity, so the band enters, crosses the wordmark, and exits once.
export function buildLinearSweep(progress: number, cfg: ShimmerConfig, width: number): SweepState {
  const tailRoom = cfg.tail * 1.5
  const head = -tailRoom + clamp(progress) * (width + tailRoom * 2)
  return {
    cfg,
    rings: 1,
    active: [{ head, eased: 1, ambient: 0 }],
  }
}
