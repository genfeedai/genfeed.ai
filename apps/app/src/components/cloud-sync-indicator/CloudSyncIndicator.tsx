'use client';

import { SignIn } from '@clerk/nextjs';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Cloud, CloudOff, X } from 'lucide-react';
import { useState } from 'react';
import { useCloudSession } from '@/hooks/useCloudSession';
import { isHybridMode, isLocalOnly } from '@/lib/config/edition';
import { getDesktopBridge, isDesktopShell } from '@/lib/desktop/runtime';

export default function CloudSyncIndicator() {
  const { isConnected } = useCloudSession();
  const [isLaunching, setIsLaunching] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const hybrid = isHybridMode();
  const local = isLocalOnly();
  const desktop = isDesktopShell();

  if (!hybrid && !local) {
    return null;
  }

  const handleConnect = async () => {
    if (!desktop) {
      setShowSignIn(true);
      return;
    }

    const bridge = getDesktopBridge();
    if (!bridge) {
      return;
    }

    setIsLaunching(true);
    try {
      await bridge.auth.login();
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="relative inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background-secondary transition-colors hover:border-border-strong hover:bg-background-tertiary cursor-pointer"
          ariaLabel={isConnected ? 'Cloud connected' : 'Cloud disconnected'}
        >
          {isConnected ? (
            <Cloud className="h-3.5 w-3.5 text-foreground/56" />
          ) : (
            <CloudOff className="h-3.5 w-3.5 text-foreground/56" />
          )}
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-background',
              isConnected ? 'bg-emerald-400' : 'bg-amber-400',
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="p-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'h-2 w-2 rounded-full',
                isConnected ? 'bg-emerald-400' : 'bg-amber-400',
              )}
            />
            <span className="text-xs font-medium text-foreground/88">
              {isConnected
                ? 'Connected to Cloud'
                : local
                  ? 'Local Mode'
                  : 'Offline'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-foreground/48">
            {isConnected
              ? 'Data syncs automatically with your cloud workspace.'
              : local
                ? 'Running locally. No cloud sync.'
                : 'Sign in to sync with your cloud workspace.'}
          </p>
        </div>
        {hybrid && !isConnected && (
          <div className="border-t border-white/[0.06] px-3 py-2">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              disabled={desktop && isLaunching}
              onClick={() => void handleConnect()}
              className="w-full rounded px-2 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/10 cursor-pointer"
            >
              {desktop && isLaunching
                ? 'Opening Browser...'
                : 'Connect to Cloud'}
            </Button>
          </div>
        )}
      </PopoverContent>
      {!desktop && showSignIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setShowSignIn(false)}
              className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground shadow-lg hover:text-foreground cursor-pointer"
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
    </Popover>
  );
}
