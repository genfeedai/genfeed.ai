'use client';

import {
  DEFAULT_THEME,
  THEME_COOKIE_MAX_AGE,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from '@genfeedai/constants';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

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

export default function ThemeCookieSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) {
      return;
    }

    const theme =
      resolvedTheme === 'system'
        ? DEFAULT_THEME
        : (resolvedTheme as ThemePreference);

    document.cookie = getCookieAttributes(theme);
  }, [resolvedTheme]);

  return null;
}
