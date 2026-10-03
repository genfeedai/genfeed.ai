import type { IDesktopWindowChromeState } from '@genfeedai/contracts/desktop';
import { useDesktopWindowChrome } from '@hooks/ui/use-desktop-window-chrome/use-desktop-window-chrome';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DesktopGlobal = typeof globalThis & {
  __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: 'desktop' | 'web' };
  genfeedDesktop?: unknown;
};

const desktopGlobal = globalThis as DesktopGlobal;

function stubPlatform(platform: string): void {
  vi.stubGlobal('navigator', {
    platform,
    userAgentData: { platform },
  });
}

function installBridge(initial: IDesktopWindowChromeState) {
  let emit: (state: IDesktopWindowChromeState) => void = () => undefined;
  const detach = vi.fn();
  desktopGlobal.genfeedDesktop = {
    app: {
      getWindowChrome: vi.fn(async () => initial),
      onDidChangeWindowChrome: vi.fn(
        (callback: (state: IDesktopWindowChromeState) => void) => {
          emit = callback;
          return detach;
        },
      ),
    },
  };
  return { detach, emit: (state: IDesktopWindowChromeState) => emit(state) };
}

describe('useDesktopWindowChrome', () => {
  beforeEach(() => {
    stubPlatform('macOS');
  });

  afterEach(() => {
    delete desktopGlobal.__GENFEED_RUNTIME_CONFIG__;
    delete desktopGlobal.genfeedDesktop;
    vi.unstubAllGlobals();
  });

  it('reports no native chrome in the browser app', () => {
    const { result } = renderHook(() => useDesktopWindowChrome());

    expect(result.current).toEqual({
      hasInlineTrafficLights: false,
      isDesktop: false,
      isMacDesktop: false,
    });
  });

  it('puts the traffic lights inline on macOS desktop', () => {
    desktopGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };
    installBridge({ isFullScreen: false });

    const { result } = renderHook(() => useDesktopWindowChrome());

    expect(result.current).toEqual({
      hasInlineTrafficLights: true,
      isDesktop: true,
      isMacDesktop: true,
    });
  });

  it('drops the inline traffic lights while the window is fullscreen', async () => {
    desktopGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };
    const bridge = installBridge({ isFullScreen: true });

    const { result, unmount } = renderHook(() => useDesktopWindowChrome());

    await waitFor(() =>
      expect(result.current.hasInlineTrafficLights).toBe(false),
    );
    expect(result.current.isMacDesktop).toBe(true);

    act(() => bridge.emit({ isFullScreen: false }));
    expect(result.current.hasInlineTrafficLights).toBe(true);

    act(() => bridge.emit({ isFullScreen: true }));
    expect(result.current.hasInlineTrafficLights).toBe(false);

    unmount();
    expect(bridge.detach).toHaveBeenCalledTimes(1);
  });

  it('keeps the native frame outside macOS', () => {
    desktopGlobal.__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };
    stubPlatform('Windows');

    const { result } = renderHook(() => useDesktopWindowChrome());

    expect(result.current).toEqual({
      hasInlineTrafficLights: false,
      isDesktop: true,
      isMacDesktop: false,
    });
  });
});
