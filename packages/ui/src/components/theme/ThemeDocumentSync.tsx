'use client';

import {
  DEFAULT_THEME,
  isThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import { useEffect } from 'react';

/**
 * Restores theme semantics on root error documents, where the normal
 * next-themes provider and bootstrap script are unavailable.
 */
export default function ThemeDocumentSync() {
  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;

    try {
      if (typeof window.matchMedia === 'function') {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      }
    } catch {
      // The deterministic fallback remains available without matchMedia.
    }

    const syncTheme = () => {
      let preference = DEFAULT_THEME;

      try {
        const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

        if (isThemePreference(storedTheme)) {
          preference = storedTheme;
        } else if (storedTheme !== null) {
          window.localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME);
        }
      } catch {
        // System remains usable when storage is blocked by the browser.
      }
      const resolvedTheme = resolveThemePreference(
        preference,
        mediaQuery ? (mediaQuery.matches ? 'dark' : 'light') : null,
      );

      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    };

    syncTheme();
    mediaQuery?.addEventListener('change', syncTheme);
    window.addEventListener('storage', syncTheme);

    return () => {
      mediaQuery?.removeEventListener('change', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  return null;
}
