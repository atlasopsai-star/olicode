export function bar(pct: number, width: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, pct)) * width)
  const empty = width - filled
  return "█".repeat(filled) + "░".repeat(empty)
}
