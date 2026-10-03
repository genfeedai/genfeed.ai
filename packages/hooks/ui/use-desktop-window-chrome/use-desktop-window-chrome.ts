'use client';

import type {
  IDesktopWindowChromeState,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import { useIsDesktopClient } from '@hooks/ui/use-is-desktop-client/use-is-desktop-client';
import { useSyncExternalStore } from 'react';

type UserAgentDataCapable = Navigator & {
  userAgentData?: { platform?: string };
};

type WindowChromeBridge = Pick<
  IGenfeedDesktopBridge['app'],
  'getWindowChrome' | 'onDidChangeWindowChrome'
>;

export interface DesktopWindowChrome {
  /** Running inside the Electron shell (any OS). */
  isDesktop: boolean;
  /** Electron on macOS: the window has no native titlebar. */
  isMacDesktop: boolean;
  /** macOS traffic lights are visible (hidden while fullscreen). */
  hasInlineTrafficLights: boolean;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const platform =
    (navigator as UserAgentDataCapable).userAgentData?.platform ??
    navigator.platform ??
    '';

  return /mac/i.test(platform);
}

function readBridge(): WindowChromeBridge | null {
  const bridge = (
    globalThis as typeof globalThis & { genfeedDesktop?: IGenfeedDesktopBridge }
  ).genfeedDesktop?.app;

  return typeof bridge?.getWindowChrome === 'function' &&
    typeof bridge?.onDidChangeWindowChrome === 'function'
    ? bridge
    : null;
}

let isFullScreen = false;
const listeners = new Set<() => void>();
let detachBridge: (() => void) | null = null;

function publish(state: IDesktopWindowChromeState): void {
  if (state.isFullScreen === isFullScreen) {
    return;
  }
  isFullScreen = state.isFullScreen;
  for (const listener of listeners) {
    listener();
  }
}

function subscribeToFullScreen(listener: () => void): () => void {
  listeners.add(listener);

  if (!detachBridge) {
    const bridge = readBridge();
    if (bridge) {
      detachBridge = bridge.onDidChangeWindowChrome(publish);
      void bridge.getWindowChrome().then(publish, () => undefined);
    }
  }

  return () => {
    listeners.delete(listener);
    if (!listeners.size && detachBridge) {
      detachBridge();
      detachBridge = null;
      // Unobserved state goes stale; the next subscriber re-reads it.
      isFullScreen = false;
    }
  };
}

const subscribeToPlatform = () => () => {};
const getFullScreenSnapshot = () => isFullScreen;
const getServerFalse = () => false;

/**
 * Native window chrome as the renderer must lay it out. On macOS the desktop
 * window has no titlebar: the traffic lights float over the shell's topbar
 * band until the window goes fullscreen, where macOS hides them.
 */
export function useDesktopWindowChrome(): DesktopWindowChrome {
  const isDesktop = useIsDesktopClient();
  const isMac = useSyncExternalStore(
    subscribeToPlatform,
    isMacPlatform,
    getServerFalse,
  );
  const isWindowFullScreen = useSyncExternalStore(
    subscribeToFullScreen,
    getFullScreenSnapshot,
    getServerFalse,
  );

  const isMacDesktop = isDesktop && isMac;

  return {
    hasInlineTrafficLights: isMacDesktop && !isWindowFullScreen,
    isDesktop,
    isMacDesktop,
  };
}
