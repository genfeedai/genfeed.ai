import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const desktopClient = vi.hoisted(() => vi.fn());
vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: desktopClient,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DeploymentVersionWatcher desktop guard', () => {
  it('still polls on the web', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', 'build-1');
    desktopClient.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: 'build-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const interval = vi.spyOn(window, 'setInterval');
    const { default: DeploymentVersionWatcher } = await import(
      '@/components/version/DeploymentVersionWatcher'
    );
    const { unmount } = render(<DeploymentVersionWatcher />);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/version',
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 60_000);
    unmount();
  });

  it('does not fetch, poll, or subscribe on desktop', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', 'build-1');
    desktopClient.mockReturnValue(true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const interval = vi.spyOn(window, 'setInterval');
    const windowListener = vi.spyOn(window, 'addEventListener');
    const documentListener = vi.spyOn(document, 'addEventListener');
    const { default: DeploymentVersionWatcher } = await import(
      '@/components/version/DeploymentVersionWatcher'
    );
    render(<DeploymentVersionWatcher />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(windowListener).not.toHaveBeenCalledWith(
      'focus',
      expect.any(Function),
    );
    expect(documentListener).not.toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });
});
