'use client';

import type { ICommandPaletteContext } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Settings } from 'lucide-react';
import { useEffect } from 'react';

export interface UseAdminCommandRegistrationOptions {
  isLoaded: boolean;
  isSuperAdmin: boolean;
  registerCommands: ICommandPaletteContext['registerCommands'];
  unregisterCommands: ICommandPaletteContext['unregisterCommands'];
}

export function useAdminCommandRegistration({
  isLoaded,
  isSuperAdmin,
  registerCommands,
  unregisterCommands,
}: UseAdminCommandRegistrationOptions): void {
  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isSuperAdmin) {
      registerCommands([
        {
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
        },
      ]);

      // Cleanup: only unregister when admin loses superAdmin status
      return () => {
        unregisterCommands(['nav-admin']);
      };
    }

    // Non-admin users: do nothing (command was never registered)
  }, [isLoaded, isSuperAdmin, registerCommands, unregisterCommands]);
}
