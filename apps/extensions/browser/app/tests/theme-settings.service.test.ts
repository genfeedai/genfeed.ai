import { beforeEach, describe, expect, it, vi } from 'vitest';

const makeAuthenticatedRequest = vi.hoisted(() => vi.fn());

vi.mock('~services/auth.service', () => ({
  authService: { makeAuthenticatedRequest },
}));

import { themeSettingsService } from '~services/theme-settings.service';

describe('themeSettingsService', () => {
  beforeEach(() => {
    makeAuthenticatedRequest.mockReset();
  });

  it('reads the canonical account theme from users/me/settings', async () => {
    makeAuthenticatedRequest.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            attributes: { theme: 'light' },
            id: 'settings-1',
            type: 'setting',
          },
        }),
        { status: 200 },
      ),
    );

    await expect(themeSettingsService.getTheme()).resolves.toBe('light');
    expect(makeAuthenticatedRequest).toHaveBeenCalledWith(
      'https://api.genfeed.ai/v1/users/me/settings',
      { method: 'GET' },
    );
  });

  it('normalizes an invalid account theme to System', async () => {
    makeAuthenticatedRequest.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            attributes: { theme: 'sepia' },
            id: 'settings-1',
            type: 'setting',
          },
        }),
        { status: 200 },
      ),
    );

    await expect(themeSettingsService.getTheme()).resolves.toBe('system');
  });

  it('patches only the selected theme preference', async () => {
    makeAuthenticatedRequest.mockResolvedValue(new Response(null, { status: 204 }));

    await themeSettingsService.updateTheme('dark');

    expect(makeAuthenticatedRequest).toHaveBeenCalledWith(
      'https://api.genfeed.ai/v1/users/me/settings',
      {
        body: JSON.stringify({ theme: 'dark' }),
        method: 'PATCH',
      },
    );
  });

  it('rejects unsuccessful settings responses', async () => {
    makeAuthenticatedRequest.mockResolvedValue(
      new Response(null, { status: 500, statusText: 'Server Error' }),
    );

    await expect(themeSettingsService.getTheme()).rejects.toThrow(
      'Unable to load account theme',
    );
  });
});
