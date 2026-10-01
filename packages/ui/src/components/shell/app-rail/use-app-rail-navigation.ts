'use client';

import type {
  AppRailNavigationItem,
  AppRailNavigationVia,
} from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { UseAppRailNavigationOptions } from '@genfeedai/props/ui/app-rail.props';
import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { createNavigationCommands } from '@genfeedai/services/core/commands.registry';
import { useEffect, useEffectEvent } from 'react';
import { createAppRailShortcutHandler } from './app-rail.shortcuts';

function getRegistrationKey(items: readonly AppRailNavigationItem[]): string {
  return JSON.stringify(
    items.map((item) => [
      item.app.id,
      item.app.group,
      item.label,
      item.description,
    ]),
  );
}

export function useAppRailNavigation({
  items,
  surface,
  isDesktop,
  commandLabel,
  navigate,
}: UseAppRailNavigationOptions): void {
  const registrationKey = getRegistrationKey(items);
  const getItems = useEffectEvent(() => items);
  const getCommandLabel = useEffectEvent((label: string) =>
    commandLabel(label),
  );
  const navigateToApp = useEffectEvent(
    (appId: string, via: AppRailNavigationVia): boolean => {
      const item = items.find((candidate) => candidate.app.id === appId);
      if (!item) return false;
      navigate(item, via);
      return true;
    },
  );

  useEffect(() => {
    // Re-register when command membership, order, or localized metadata changes.
    void registrationKey;
    const media = window.matchMedia('(min-width: 768px)');
    let registeredIds: string[] = [];
    const { handleKeyDown, reset } = createAppRailShortcutHandler(
      isDesktop,
      (index) => {
        const item = getItems().filter(
          (candidate) => candidate.app.group === 'daily',
        )[index];
        if (!item) return false;
        return navigateToApp(item.app.id, 'shortcut');
      },
    );
    const cleanup = () => {
      CommandPaletteService.unregisterCommands(registeredIds);
      registeredIds = [];
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', reset);
      window.removeEventListener('blur', reset);
      reset();
    };
    const syncSurface = () => {
      cleanup();
      // Both rail copies stay mounted. Only the surface at the current
      // breakpoint owns commands and keyboard listeners (even with the drawer closed).
      if (media.matches !== (surface === 'desktop')) return;
      registeredIds = CommandPaletteService.registerCommands(
        createNavigationCommands({
          items: getItems(),
          commandLabel: getCommandLabel,
          navigate: (item) => {
            navigateToApp(item.app.id, 'palette');
          },
          surface,
        }),
      );
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('focusin', reset);
      window.addEventListener('blur', reset);
    };
    syncSurface();
    media.addEventListener('change', syncSurface);
    return () => {
      cleanup();
      media.removeEventListener('change', syncSurface);
    };
  }, [registrationKey, surface, isDesktop]);
}
