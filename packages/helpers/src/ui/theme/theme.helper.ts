import {
  DEFAULT_THEME,
  isThemePreference,
  THEME_COOKIE_NAME,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import { cookies } from 'next/headers';

export async function resolveRequestTheme(): Promise<ThemePreference> {
  const cookieStore = await cookies();
  const theme = cookieStore.get(THEME_COOKIE_NAME)?.value;

  if (isThemePreference(theme)) {
    return theme;
  }

  return DEFAULT_THEME;
}
