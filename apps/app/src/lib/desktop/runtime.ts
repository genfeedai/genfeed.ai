'use client';

import type {
  IDesktopSession,
  IGenfeedDesktopBridge,
} from '@genfeedai/desktop-contracts';

type DesktopWindow = Window &
  typeof globalThis & {
    genfeedDesktop?: IGenfeedDesktopBridge;
  };

export function isDesktopShell(): boolean {
  return process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
}

export function getDesktopBridge(): IGenfeedDesktopBridge | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as DesktopWindow).genfeedDesktop ?? null;
}

export async function getDesktopSession(): Promise<IDesktopSession | null> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return null;
  }

  return bridge.auth.getSession();
}
