import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { useMemo } from 'react';
import { useMobileTheme } from '@/contexts/theme-context';

const themedStylesCache = new WeakMap<
  object,
  WeakMap<NativeThemeColors, unknown>
>();

export function useThemedStyles<T>(
  createStyles: (colors: NativeThemeColors) => T,
): T {
  const { colors } = useMobileTheme();

  return useMemo(() => {
    let themeCache = themedStylesCache.get(createStyles);
    if (!themeCache) {
      themeCache = new WeakMap<NativeThemeColors, unknown>();
      themedStylesCache.set(createStyles, themeCache);
    }

    const cachedStyles = themeCache.get(colors);
    if (cachedStyles) {
      return cachedStyles as T;
    }

    const styles = createStyles(colors);
    themeCache.set(colors, styles);
    return styles;
  }, [colors, createStyles]);
}
