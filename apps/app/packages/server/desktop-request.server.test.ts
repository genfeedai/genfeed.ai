import { DESKTOP_HTTP_HEADERS } from '@genfeedai/contracts/desktop';
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

  it('is true when Electron sends the desktop version header', async () => {
    vi.resetModules();
    headersMock.get.mockImplementation((name: string) =>
      name === DESKTOP_HTTP_HEADERS.version ? '0.1.1' : null,
    );
    const { isDesktopServerRequest } = await import('./desktop-request.server');

    await expect(isDesktopServerRequest()).resolves.toBe(true);
  });

  it('is false for ordinary web requests', async () => {
    vi.resetModules();
    headersMock.get.mockReturnValue(null);
    const { isDesktopServerRequest } = await import('./desktop-request.server');

    await expect(isDesktopServerRequest()).resolves.toBe(false);
  });
});
