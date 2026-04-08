'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Cloud, CloudOff, Monitor } from 'lucide-react';
import { useCloudSession } from '@/hooks/useCloudSession';
import { isHybridMode, isLocalOnly } from '@/lib/config/edition';
import { cn } from '@/lib/utils';

interface ModeIndicatorProps {
  collapsed?: boolean;
  onConnectClick?: () => void;
}

export default function ModeIndicator({
  collapsed = false,
  onConnectClick,
}: ModeIndicatorProps) {
  const { isConnected } = useCloudSession();
  const hybrid = isHybridMode();
  const local = isLocalOnly();

  if (!hybrid && !local) {
    // Cloud mode — no indicator needed
    return null;
  }

  if (hybrid && isConnected) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5',
          'bg-emerald-500/10 text-emerald-400',
          collapsed && 'justify-center px-0',
        )}
      >
        <Cloud className="h-3.5 w-3.5 shrink-0" />
        {!collapsed && (
          <span className="truncate text-xs font-medium">Connected</span>
        )}
      </div>
    );
  }

  if (hybrid) {
    return (
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={onConnectClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5',
          'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer',
          collapsed && 'justify-center px-0',
        )}
      >
        <CloudOff className="h-3.5 w-3.5 shrink-0" />
        {!collapsed && (
          <span className="truncate text-xs font-medium">Connect to Cloud</span>
        )}
      </Button>
    );
  }

  // Local-only mode
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5',
        'bg-white/[0.04] text-muted-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <Monitor className="h-3.5 w-3.5 shrink-0" />
      {!collapsed && (
        <span className="truncate text-xs font-medium">Local Mode</span>
      )}
    </div>
  );
}
