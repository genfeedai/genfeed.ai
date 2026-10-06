'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  isThemePreference,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';

/**
 * Applies the signed-in account preference over the browser theme cache.
 *
 * next-themes reads localStorage in an effect that runs after this one, so
 * the first correction can lose. The account value is remembered only after
 * the active theme matches it, which lets that late cache read be corrected.
 * Once they match, a local change stays in place while its settings PATCH is
 * in flight. Invalid stored values are ignored so the client keeps System
 * until a valid preference arrives.
 */
export default function ThemePreferenceSync() {
  const { currentUser } = useCurrentUser();
  const { setTheme, theme } = useTheme();
  const appliedAccountPreference = useRef<ThemePreference | undefined>(
    undefined,
  );
  const storedPreference = currentUser?.settings?.theme;
  const accountPreference = isThemePreference(storedPreference)
    ? storedPreference
    : undefined;

  useEffect(() => {
    if (accountPreference === undefined) {
      return;
    }

    if (theme === accountPreference) {
      appliedAccountPreference.current = accountPreference;
      return;
    }

    // The account value is already on screen. A different active theme is an
    // optimistic edit that has not been saved yet.
    if (appliedAccountPreference.current === accountPreference) {
      return;
    }

    setTheme(accountPreference);
  }, [accountPreference, setTheme, theme]);

  return null;
}
