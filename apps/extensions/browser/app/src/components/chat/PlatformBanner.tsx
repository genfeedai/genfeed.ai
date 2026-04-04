import type { ReactElement } from 'react';

import { usePlatformStore } from '~store/use-platform-store';

const PLATFORM_DISPLAY: Record<string, { name: string; color: string }> = {
  facebook: { color: 'text-blue-600', name: 'Facebook' },
  instagram: { color: 'text-pink-500', name: 'Instagram' },
  linkedin: { color: 'text-blue-500', name: 'LinkedIn' },
  reddit: { color: 'text-orange-500', name: 'Reddit' },
  tiktok: { color: 'text-foreground', name: 'TikTok' },
  twitter: { color: 'text-sky-400', name: 'Twitter/X' },
  youtube: { color: 'text-red-500', name: 'YouTube' },
};

export function PlatformBanner(): ReactElement | null {
  const currentPlatform = usePlatformStore((s) => s.currentPlatform);

  if (!currentPlatform) {
    return null;
  }

  const display = PLATFORM_DISPLAY[currentPlatform];
  if (!display) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-3 py-1.5">
      <span className={`text-xs font-medium ${display.color}`}>
        {display.name}
      </span>
      <span className="text-[10px] text-muted-foreground">
        Content will be optimized for this platform
      </span>
    </div>
  );
}
