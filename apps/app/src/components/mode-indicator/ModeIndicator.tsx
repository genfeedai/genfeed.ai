'use client';

import { SignIn } from '@clerk/nextjs';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Cloud, CloudOff, Monitor, X } from 'lucide-react';
import { useState } from 'react';
import { useCloudSession } from '@/hooks/useCloudSession';
import { isHybridMode, isLocalOnly } from '@/lib/config/edition';
import { cn } from '@/lib/utils';

interface ModeIndicatorProps {
  collapsed?: boolean;
}

export default function ModeIndicator({
  collapsed = false,
}: ModeIndicatorProps) {
  const { isConnected } = useCloudSession();
  const [showSignIn, setShowSignIn] = useState(false);
  const hybrid = isHybridMode();
  const local = isLocalOnly();

  if (!hybrid && !local) {
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
      <>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          onClick={() => setShowSignIn(true)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5',
            'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer',
            collapsed && 'justify-center px-0',
          )}
        >
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <span className="truncate text-xs font-medium">
              Connect to Cloud
            </span>
          )}
        </Button>

        {showSignIn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative">
              <Button
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => setShowSignIn(false)}
                className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground hover:text-foreground shadow-lg cursor-pointer"
                ariaLabel="Close sign in"
              >
                <X className="h-4 w-4" />
              </Button>
              <SignIn
                routing="hash"
                fallbackRedirectUrl="/"
                appearance={{
                  elements: {
                    card: 'shadow-2xl',
                    rootBox: 'mx-auto',
                  },
                }}
              />
            </div>
          </div>
        )}
      </>
    );
  }

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
