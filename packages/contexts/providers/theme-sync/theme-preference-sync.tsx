'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

/**
 * Applies the signed-in account preference to next-themes.
 *
 * The last server value is tracked separately from the active client value so
 * an optimistic choice is not immediately overwritten while its PATCH is in
 * flight. A later account refresh or cross-device change still applies because
 * it produces a new server value. Invalid stored values are ignored so the
 * client keeps System until a valid preference arrives.
 */
export default function ThemePreferenceSync() {
  const { currentUser } = useCurrentUser();
  const { setTheme, theme } = useTheme();
  const lastServerPreference = useRef<ThemePreference | undefined>(undefined);
  const storedPreference = currentUser?.settings?.theme;
  const accountPreference = isThemePreference(storedPreference)
    ? storedPreference
    : undefined;

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
