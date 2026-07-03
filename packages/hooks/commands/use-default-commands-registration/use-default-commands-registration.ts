'use client';

import { CommandPaletteService } from '@genfeedai/services/core/command-palette.service';
import { registerDefaultCommands } from '@genfeedai/services/core/commands.registry';
import { logger } from '@genfeedai/services/core/logger.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { useEffect } from 'react';

export function useDefaultCommandsRegistration(): void {
  const { orgSlug, brandSlug } = useOrgUrl();

  useEffect(() => {
    if (!orgSlug || !brandSlug) {
      return;
    }

    let registeredCommandIds: string[] = [];

    try {
      registeredCommandIds = registerDefaultCommands(orgSlug, brandSlug);

      logger.info('Command palette initialized with default commands');
    } catch (error) {
      logger.warn('Failed to initialize command palette', { error });
    }

    // The service is a module singleton that outlives this component, so
    // unregister on unmount — otherwise any remount (StrictMode, layout
    // branch swap, /settings navigation) re-registers the same ids and
    // emits "Commands already registered" warnings.
    return () => {
      if (registeredCommandIds.length > 0) {
        CommandPaletteService.unregisterCommands(registeredCommandIds);
      }
    };
  }, [orgSlug, brandSlug]);
}
