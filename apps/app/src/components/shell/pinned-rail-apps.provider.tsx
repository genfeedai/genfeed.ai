'use client';

import { createContext, type ReactNode, use } from 'react';
import { usePinnedRailApps } from '@/components/shell/use-pinned-rail-apps';

interface PinnedRailAppsContextValue {
  pinnedAppIds: readonly string[];
  togglePin: (appId: string) => void;
}

const PinnedRailAppsContext = createContext<PinnedRailAppsContextValue>({
  pinnedAppIds: [],
  togglePin: () => {},
});

/**
 * The member's rail pins, shared by the rail and Explore so a pin changed on
 * an Explore card shows on the rail without a reload.
 */
export function PinnedRailAppsProvider({ children }: { children: ReactNode }) {
  const value = usePinnedRailApps();

  return (
    <PinnedRailAppsContext value={value}>{children}</PinnedRailAppsContext>
  );
}

export function usePinnedRailAppsContext(): PinnedRailAppsContextValue {
  return use(PinnedRailAppsContext);
}
