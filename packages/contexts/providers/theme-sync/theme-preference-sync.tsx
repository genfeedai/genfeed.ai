'use client';

import {
  DEFAULT_THEME,
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/constants';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

/**
 * Applies the signed-in account preference to next-themes.
 *
 * The last server value is tracked separately from the active client value so
 * an optimistic choice is not immediately overwritten while its PATCH is in
 * flight. A later account refresh or cross-device change still applies because
 * it produces a new server value.
 */
export default function ThemePreferenceSync() {
  const { currentUser } = useCurrentUser();
  const { setTheme, theme } = useTheme();
  const lastServerPreference = useRef<ThemePreference | undefined>(undefined);
  const storedPreference = currentUser?.settings?.theme;
  const accountPreference =
    storedPreference === undefined || storedPreference === null
      ? undefined
      : isThemePreference(storedPreference)
        ? storedPreference
        : DEFAULT_THEME;

  useEffect(() => {
    if (
      accountPreference === undefined ||
      lastServerPreference.current === accountPreference
    ) {
      return;
    }

    lastServerPreference.current = accountPreference;

    if (theme !== accountPreference) {
      setTheme(accountPreference);
    }
  }, [accountPreference, setTheme, theme]);

  return null;
}
