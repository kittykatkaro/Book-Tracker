import colors from '@/constants/colors';
import { useTheme } from '@/context/ThemeContext';

/**
 * Returns the design tokens for the active color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`. The active palette is
 * driven by the user's theme preference (light/dark/system, or one of
 * the fixed named palettes) managed in ThemeContext; `system` follows
 * the device appearance setting.
 */
export function useColors() {
  const { resolvedTheme } = useTheme();
  const palette = colors[resolvedTheme] ?? colors.light;
  return { ...palette, radius: colors.radius };
}
