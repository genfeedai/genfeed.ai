'use client';

import {
  DEFAULT_THEME,
  isThemePreference,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import type { AppProvidersProps } from '@genfeedai/props/providers/app-providers.props';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

type ThemeCookieSyncProps = Pick<AppProvidersProps, 'storageKey'>;

function getCookieAttributes(theme: ThemePreference) {
  const segments = [
    `${THEME_COOKIE_NAME}=${theme}`,
    'path=/',
    `max-age=${THEME_COOKIE_MAX_AGE}`,
    'SameSite=Lax',
  ];

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    segments.push('Secure');
  }

  return segments.join('; ');
}

export default function ThemeCookieSync({
  storageKey = THEME_STORAGE_KEY,
}: ThemeCookieSyncProps = {}) {
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const normalizeInvalidTheme = (candidate?: string | null) => {
      let storedTheme = candidate;

      try {
        storedTheme ??= window.localStorage.getItem(storageKey);
      } catch {
        storedTheme = null;
      }

      const runtimeThemeIsInvalid =
        theme !== undefined && !isThemePreference(theme);
      const storedThemeIsInvalid =
        storedTheme !== null && !isThemePreference(storedTheme);

      if (!runtimeThemeIsInvalid && !storedThemeIsInvalid) {
        return;
      }

      try {
        window.localStorage.setItem(storageKey, DEFAULT_THEME);
      } catch {
        // next-themes still receives the safe runtime preference below.
      }
      setTheme(DEFAULT_THEME);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        normalizeInvalidTheme(event.newValue);
      }
    };

    normalizeInvalidTheme();
    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);
  }, [setTheme, storageKey, theme]);

  useEffect(() => {
    if (!isThemePreference(theme)) {
      return;
    }

    document.cookie = getCookieAttributes(theme);
  }, [theme]);

  return null;
}
