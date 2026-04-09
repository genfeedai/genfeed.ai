'use client';

import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useEffect } from 'react';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

export interface UseAdminCommandRegistrationOptions {
  isLoaded: boolean;
  isSuperAdmin: boolean;
  registerCommand: (command: ICommand) => void;
  unregisterCommand: (commandId: string) => void;
}

export function useAdminCommandRegistration({
  isLoaded,
  isSuperAdmin,
  registerCommand,
  unregisterCommand,
}: UseAdminCommandRegistrationOptions): void {
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isSuperAdmin) {
      registerCommand({
        action: () => {
          window.location.href = EnvironmentService.apps.admin;
        },
        category: 'navigation',
        condition: () => EnvironmentService.currentApp !== 'admin',
        description: 'Govern accounts',
        icon: HiOutlineCog6Tooth,
        id: 'nav-admin',
        keywords: ['admin', 'govern', 'accounts', 'management'],
        label: 'Go to Admin',
        priority: 9,
      });
      logger.info('Admin command registered');

      // Cleanup: only unregister when admin loses superAdmin status
      return () => {
        unregisterCommand('nav-admin');
      };
    }

    // Non-admin users: do nothing (command was never registered)
  }, [isLoaded, isSuperAdmin, registerCommand, unregisterCommand]);
}
