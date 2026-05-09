'use client';

import type { IGenfeedDesktopBridge } from '@genfeedai/desktop-contracts';

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
