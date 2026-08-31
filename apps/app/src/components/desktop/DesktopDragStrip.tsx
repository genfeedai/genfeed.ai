'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';

type UserAgentDataCapable = Navigator & {
  userAgentData?: { platform?: string };
};

const AUTH_FULL_BLEED_PREFIXES = [
  '/login',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/oauth',
] as const;

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

export function isDesktopAuthFullBleedPath(pathname: string): boolean {
  return AUTH_FULL_BLEED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function DesktopDragStripContent() {
  const pathname = usePathname();
  const isMac = useSyncExternalStore(subscribe, detectMac, () => false);

  if (
    !isDesktopClient() ||
    !isMac ||
    isDesktopAuthFullBleedPath(pathname ?? '')
  ) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-desktop-drag="true"
      className="border-b border-border bg-background/95 backdrop-blur"
      style={{
        height: 32,
        left: 0,
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 50,
      }}
    />
  );
}

export default function DesktopDragStrip() {
  return <DesktopDragStripContent />;
}
