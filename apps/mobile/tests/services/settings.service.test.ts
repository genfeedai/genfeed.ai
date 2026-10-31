import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/base-http.service', () => ({
  apiRequest,
}));

import { mobileSettingsService } from '@/services/api/settings.service';

describe('mobileSettingsService', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('reads a valid account theme from the current-user settings endpoint', async () => {
    apiRequest.mockResolvedValue({
      data: {
        attributes: { theme: 'light' },
        id: 'settings-1',
        type: 'setting',
      },
    });

    await expect(mobileSettingsService.getTheme('token')).resolves.toBe(
      'light',
    );
    expect(apiRequest).toHaveBeenCalledWith('token', 'users/me/settings');
  });

  it('normalizes an invalid account theme to the System preference', async () => {
    apiRequest.mockResolvedValue({
      data: {
        attributes: { theme: 'sepia' },
        id: 'settings-1',
        type: 'setting',
      },
    });

    await expect(mobileSettingsService.getTheme('token')).resolves.toBe(
      'system',
    );
  });

  it('patches only the theme preference', async () => {
    apiRequest.mockResolvedValue({ data: {} });

    await mobileSettingsService.updateTheme('token', 'dark');

    expect(apiRequest).toHaveBeenCalledWith('token', 'users/me/settings', {
      body: { theme: 'dark' },
      method: 'PATCH',
    });
  });
});
