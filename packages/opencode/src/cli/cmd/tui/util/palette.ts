import type { RGBA } from "@opentui/core"
import { useTheme } from "../context/theme"

// OliCode semantic palette — the centralized visual system for OliCode-branded
// panels. Read colors through this helper instead of scattering ad-hoc colors.
// Gold stays the brand identity; cyan/purple/magenta mark information,
// intelligence, and design. Falls back gracefully on non-OliCode themes.
export function usePalette() {
  const { theme } = useTheme()
  const extended = theme as unknown as Record<string, RGBA | undefined>
  return {
    background: theme.background,
    surface: theme.backgroundPanel,
    surfaceMuted: theme.backgroundElement,
    border: theme.border,
    borderStrong: theme.borderActive,
    borderSubtle: extended.borderSubtle ?? theme.border,
    gold: theme.primary,
    text: theme.text,
    textSecondary: theme.textMuted,
    textMuted: theme.textMuted,
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
    info: theme.info,
    purple: theme.accent,
    magenta: extended.magenta ?? theme.accent,
    added: theme.diffAdded,
    removed: theme.diffRemoved,
  }
}
