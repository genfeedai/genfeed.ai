import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@plasmohq/storage', () => ({
  Storage: class Storage {
    get = vi.fn();
    remove = vi.fn();
    set = vi.fn();
  },
}));

const originalEnv = { ...process.env };

describe('browser extension auth cookie configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(chrome.cookies.getAll).mockClear();
    process.env = {
      ...originalEnv,
      PLASMO_PUBLIC_ENV: 'development',
    };
    delete process.env.PLASMO_PUBLIC_APP_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('inspects the canonical cookie origin', async () => {
    const { authService } = await import('../src/services/auth.service');

    authService.debugCookies();

    expect(chrome.cookies.getAll).toHaveBeenCalledTimes(1);
    expect(chrome.cookies.getAll).toHaveBeenCalledWith(
      { url: 'https://app.genfeed.localhost' },
      expect.any(Function),
    );
  });
});
