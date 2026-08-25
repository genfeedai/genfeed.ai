'use client';

import type { ICommandPaletteContext } from '@genfeedai/interfaces/ui/command-palette.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Settings } from 'lucide-react';
import { useEffect } from 'react';

export interface UseAdminCommandRegistrationOptions {
  isLoaded: boolean;
  isSuperAdmin: boolean;
  registerCommand: ICommandPaletteContext['registerCommand'];
  unregisterCommand: ICommandPaletteContext['unregisterCommand'];
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
        icon: Settings,
        id: 'nav-admin',
        keywords: ['admin', 'govern', 'accounts', 'management'],
        label: 'Go to Admin',
        priority: 9,
      });

      // Cleanup: only unregister when admin loses superAdmin status
      return () => {
        unregisterCommand('nav-admin');
      };
    }

    // Non-admin users: do nothing (command was never registered)
  }, [isLoaded, isSuperAdmin, registerCommand, unregisterCommand]);
}
