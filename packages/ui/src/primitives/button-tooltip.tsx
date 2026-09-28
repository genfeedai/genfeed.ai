'use client';

import { type ReactElement, useContext, useSyncExternalStore } from 'react';
import type { SimpleTooltip, TooltipPosition } from './tooltip';
import { TooltipProviderContext } from './tooltip-context';

type SimpleTooltipComponent = typeof SimpleTooltip;

export interface ButtonTooltipProps {
  children: ReactElement;
  label: string;
  position: TooltipPosition;
}

let loadedTooltip: SimpleTooltipComponent | null = null;
let isTooltipLoading = false;
const listeners = new Set<() => void>();

function loadTooltip(): void {
  if (loadedTooltip || isTooltipLoading) {
    return;
  }

  isTooltipLoading = true;
  void import('./tooltip')
    .then((module) => {
      loadedTooltip = module.SimpleTooltip;
      for (const listener of listeners) {
        listener();
      }
    })
    .catch(() => {
      // Offline or blocked: the button still works without its hint, and the
      // next tooltip button to mount tries again.
    })
    .finally(() => {
      isTooltipLoading = false;
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  loadTooltip();
  return () => {
    listeners.delete(listener);
  };
}

function getLoadedTooltip(): SimpleTooltipComponent | null {
  return loadedTooltip;
}

// The server and the hydrating client both render the bare button, so the
// markup always matches; the hint attaches once the module is in.
function getServerTooltip(): null {
  return null;
}

function DeferredTooltip({ children, label, position }: ButtonTooltipProps) {
  const LoadedTooltip = useSyncExternalStore(
    subscribe,
    getLoadedTooltip,
    getServerTooltip,
  );

  if (!LoadedTooltip) {
    return children;
  }

  return (
    <LoadedTooltip label={label} position={position}>
      {children}
    </LoadedTooltip>
  );
}

/**
 * The tooltip a `Button` renders for its `tooltip` prop.
 *
 * Importing Radix Tooltip from `Button` put it (with Floating UI, ~14 KB gzip)
 * on every page that renders a button, including website pages that never
 * show a hint. Under a `TooltipProvider` (the app mounts one at the root) the
 * tooltip renders at once, exactly as before. Without one, the tooltip module
 * loads after hydration and the hint attaches when it arrives.
 */
export default function ButtonTooltip({
  children,
  label,
  position,
}: ButtonTooltipProps) {
  const ProvidedTooltip = useContext(TooltipProviderContext);

  if (ProvidedTooltip) {
    return (
      <ProvidedTooltip label={label} position={position}>
        {children}
      </ProvidedTooltip>
    );
  }

  return (
    <DeferredTooltip label={label} position={position}>
      {children}
    </DeferredTooltip>
  );
}
