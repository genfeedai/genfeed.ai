'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { registerDefaultCommands } from '@services/core/commands.registry';
import { logger } from '@services/core/logger.service';
import { useEffect } from 'react';

export function useDefaultCommandsRegistration(): void {
  const { orgSlug, brandSlug } = useOrgUrl();

  useEffect(() => {
    if (!orgSlug || !brandSlug) {
      return;
    }

    try {
      registerDefaultCommands(orgSlug, brandSlug);

      logger.info('Command palette initialized with default commands');
    } catch (error) {
      logger.warn('Failed to initialize command palette', { error });
    }
  }, [orgSlug, brandSlug]);
}
