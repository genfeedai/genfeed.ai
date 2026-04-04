import { beforeEach, describe, expect, it, vi } from 'vitest';

// theme.helper.ts uses 'use server' + next/headers which cannot run in vitest.
// We test the module's conditional logic by mocking next/headers and
// the constants it depends on.

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@genfeedai/constants', () => ({
  DEFAULT_THEME: 'light',
  THEME_COOKIE_NAME: 'theme',
}));

import { resolveRequestTheme } from '@helpers/ui/theme/theme.helper';
import { cookies } from 'next/headers';

describe('resolveRequestTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "dark" when the theme cookie is "dark"', async () => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'dark' }),
    });
    const theme = await resolveRequestTheme();
    expect(theme).toBe('dark');
  });

  it('returns "light" when the theme cookie is "light"', async () => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'light' }),
    });
    const theme = await resolveRequestTheme();
    expect(theme).toBe('light');
  });

  it('returns DEFAULT_THEME when cookie has an unrecognised value', async () => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'solarized' }),
    });
    const theme = await resolveRequestTheme();
    expect(theme).toBe('light');
  });

  it('returns DEFAULT_THEME when the cookie is absent', async () => {
    (cookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    });
    const theme = await resolveRequestTheme();
    expect(theme).toBe('light');
  });
});
