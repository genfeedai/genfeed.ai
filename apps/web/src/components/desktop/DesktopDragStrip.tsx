'use client';

import { usePathname } from 'next/navigation';
import { useDesktopWindowChrome } from '@/hooks/ui/use-desktop-window-chrome/use-desktop-window-chrome';

const AUTH_FULL_BLEED_PREFIXES = [
  '/login',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/oauth',
] as const;

function isDesktopAuthFullBleedPath(pathname: string): boolean {
  return AUTH_FULL_BLEED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function DesktopDragStripContent() {
  const pathname = usePathname();
  const { isMacDesktop } = useDesktopWindowChrome();

  if (!isMacDesktop || isDesktopAuthFullBleedPath(pathname ?? '')) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      data-desktop-drag="true"
      // Merged with the shell: no border, no blur, no alpha, the page's own
      // background. When the shell topbar is the titlebar it owns dragging
      // and the traffic lights, so the strip yields.
      className="bg-background [body:has([data-desktop-titlebar=topbar])_&]:hidden"
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
