'use client';

import { useSyncExternalStore } from 'react';

const IS_DESKTOP_SHELL = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';

type UserAgentDataCapable = Navigator & {
  userAgentData?: { platform?: string };
};

function detectMac(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const platform =
    (navigator as UserAgentDataCapable).userAgentData?.platform ??
    navigator.platform ??
    '';

  return /mac/i.test(platform);
}

function subscribe(): () => void {
  return () => {};
}

export default function DesktopDragStrip() {
  const isMac = useSyncExternalStore(subscribe, detectMac, () => false);

  return IS_DESKTOP_SHELL && isMac ? (
    <div
      aria-hidden="true"
      data-desktop-drag="true"
      className="ship-ui border-b border-white/[0.06] bg-background/95 backdrop-blur"
      style={{
        height: 32,
        left: 0,
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 50,
      }}
    />
  ) : null;
}
