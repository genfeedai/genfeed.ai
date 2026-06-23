'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { useAdminCommandRegistration } from '@genfeedai/hooks/commands/use-admin-command-registration/use-admin-command-registration';
import { useDefaultCommandsRegistration } from '@genfeedai/hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { useCommandPalette } from '@genfeedai/hooks/ui/use-command-palette/use-command-palette';

export function CommandPaletteInitializer(): null {
  const { isLoading, isSuperAdmin } = useAccessState();
  const { registerCommand, unregisterCommand } = useCommandPalette();

  useDefaultCommandsRegistration();

  useAdminCommandRegistration({
    isLoaded: !isLoading,
    isSuperAdmin,
    registerCommand,
    unregisterCommand,
  });

  return null;
}
