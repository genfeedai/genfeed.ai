'use server';

import {
  DEFAULT_THEME,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from '@genfeedai/constants';
import { cookies } from 'next/headers';

export async function resolveRequestTheme(): Promise<ThemePreference> {
  const cookieStore = await cookies();
  const theme = cookieStore.get(THEME_COOKIE_NAME)?.value;

  if (theme === 'dark' || theme === 'light') {
    return theme;
  }

  return DEFAULT_THEME;
}
