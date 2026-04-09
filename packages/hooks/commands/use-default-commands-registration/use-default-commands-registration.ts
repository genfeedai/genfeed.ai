'use client';

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

    try {
      registerDefaultCommands(orgSlug, brandSlug);

      logger.info('Command palette initialized with default commands');
    } catch (error) {
      logger.warn('Failed to initialize command palette', { error });
    }
  }, [orgSlug, brandSlug]);
}
