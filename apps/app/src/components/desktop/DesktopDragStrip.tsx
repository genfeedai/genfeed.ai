'use client';

import { useDesktopWindowChrome } from '@hooks/ui/use-desktop-window-chrome/use-desktop-window-chrome';
import { usePathname } from 'next/navigation';

const AUTH_FULL_BLEED_PREFIXES = [
  '/login',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/oauth',
] as const;

export function isDesktopAuthFullBleedPath(pathname: string): boolean {
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
      // Merged with the shell: no border, no blur, no alpha. The chrome shell
      // (rail + sidebar + the root behind this strip) paints gray-100; a page
      // with no chrome paints background. When the shell topbar is the
      // titlebar it owns dragging and the traffic lights, so the strip yields.
      className="bg-background [body:has([data-desktop-titlebar=topbar])_&]:hidden [body:has([data-shell-chrome=true])_&]:bg-gray-100"
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
