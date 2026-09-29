import { beforeEach, describe, expect, it, vi } from 'vitest';

const headersMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => headersMock,
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1',
}));

describe('isDesktopServerRequest', () => {
  beforeEach(() => {
    headersMock.get.mockReset();
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', undefined);
  });

  it('is true when the bundled desktop shell env is set', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '1');
    const { isDesktopServerRequest } = await import('./desktop-request.server');

    await expect(isDesktopServerRequest()).resolves.toBe(true);
    expect(headersMock.get).not.toHaveBeenCalled();
  });
});
