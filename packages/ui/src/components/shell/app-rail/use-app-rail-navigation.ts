'use client';

import type { UseAppRailNavigationOptions } from '@genfeedai/props/ui/app-rail.props';
import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { createNavigationCommands } from '@genfeedai/services/core/commands.registry';
import { useEffect } from 'react';
import { createAppRailShortcutHandler } from './app-rail.shortcuts';

export function useAppRailNavigation({
  items,
  surface,
  isDesktop,
  commandLabel,
  navigate,
}: UseAppRailNavigationOptions): void {
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    let registeredIds: string[] = [];
    const numberedItems = items.filter((item) => item.app.group !== 'admin');
    const { handleKeyDown, reset } = createAppRailShortcutHandler(
      isDesktop,
      (index) => {
        const item = numberedItems[index];
        if (!item) return false;
        navigate(item, 'shortcut');
        return true;
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
          items,
          commandLabel,
          navigate: (item) => navigate(item, 'palette'),
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
  }, [items, surface, isDesktop, commandLabel, navigate]);
}
