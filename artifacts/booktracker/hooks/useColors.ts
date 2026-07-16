import colors from '@/constants/colors';
import { useTheme } from '@/context/ThemeContext';

/**
 * Returns the design tokens for the active color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`. The active palette is
 * driven by the user's theme preference (light/dark/system) managed in
 * ThemeContext; `system` follows the device appearance setting.
 */
export function useColors() {
  const { resolvedTheme } = useTheme();
  const palette = resolvedTheme === 'dark' ? colors.dark : colors.light;
  return { ...palette, radius: colors.radius };
}
