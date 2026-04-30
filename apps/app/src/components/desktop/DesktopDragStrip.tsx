'use client';

import { useEffect, useState } from 'react';

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

export default function DesktopDragStrip() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(detectMac());
  }, []);

  if (!IS_DESKTOP_SHELL || !isMac) {
    return null;
  }

  return (
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
        zIndex: 9999,
      }}
    />
  );
}
