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

  it('inspects the canonical cookie origin before the compatibility origin', async () => {
    const { authService } = await import('../src/services/auth.service');

    authService.debugCookies();

    expect(chrome.cookies.getAll).toHaveBeenNthCalledWith(
      1,
      { url: 'http://genfeed.localhost:3000' },
      expect.any(Function),
    );
    expect(chrome.cookies.getAll).toHaveBeenNthCalledWith(
      2,
      { url: 'http://local.genfeed.ai:3000' },
      expect.any(Function),
    );
  });
});
