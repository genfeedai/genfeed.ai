import type { IGenfeedDesktopBridge } from '@genfeedai/contracts/desktop';

type DesktopBridgeWindow = Window &
  typeof globalThis & {
    genfeedDesktop?: IGenfeedDesktopBridge;
  };

/** The Electron preload bridge, or null in a regular browser. */
export function getGenfeedDesktopBridge(): IGenfeedDesktopBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as DesktopBridgeWindow).genfeedDesktop ?? null;
}
