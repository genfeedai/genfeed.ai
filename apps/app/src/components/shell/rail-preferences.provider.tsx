'use client';

import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, use } from 'react';
import { useRailPreferences } from '@/components/shell/use-rail-preferences';

interface RailPreferencesContextValue {
  homeAppId: string | null;
  /** True once the saved preferences have been read, or the read failed. */
  isLoaded: boolean;
  pinnedAppIds: readonly string[];
  railAppOrder: readonly string[];
  setHomeAppId: (appId: string | null) => void;
  setRailAppOrder: (order: readonly string[]) => void;
  togglePin: (appId: string) => void;
}

const RailPreferencesContext = createContext<RailPreferencesContextValue>({
  homeAppId: null,
  // Outside a provider there is nothing to wait for.
  isLoaded: true,
  pinnedAppIds: [],
  railAppOrder: [],
  setHomeAppId: () => {},
  setRailAppOrder: () => {},
  togglePin: () => {},
});

/**
 * The member's rail pins, order and home app, shared by the rail and Explore so a change
 * made in either shows in the other without a reload.
 */
export function RailPreferencesProvider({ children }: { children: ReactNode }) {
  const translate = useTranslations('common.appRail');
  const value = useRailPreferences({
    onSaveError: () =>
      NotificationsService.getInstance().error(translate('saveFailed')),
  });

  return (
    <RailPreferencesContext value={value}>{children}</RailPreferencesContext>
  );
}

export function useRailPreferencesContext(): RailPreferencesContextValue {
  return use(RailPreferencesContext);
}
