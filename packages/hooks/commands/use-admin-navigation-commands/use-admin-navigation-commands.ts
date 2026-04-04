'use client';

import { registerAdminNavigationCommands } from '@services/core/admin-commands.registry';
import { logger } from '@services/core/logger.service';
import { useEffect } from 'react';

export function useAdminNavigationCommands(): void {
  useEffect(() => {
    try {
      registerAdminNavigationCommands();

      logger.info('Admin navigation commands registered');
    } catch (error) {
      logger.warn('Failed to register admin navigation commands', { error });
    }
  }, []);
}
