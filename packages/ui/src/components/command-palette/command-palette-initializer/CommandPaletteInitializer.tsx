'use client';

import { useUser } from '@clerk/nextjs';
import { getClerkPublicData } from '@helpers/auth/clerk.helper';
import { useAdminCommandRegistration } from '@hooks/commands/use-admin-command-registration/use-admin-command-registration';
import { useDefaultCommandsRegistration } from '@hooks/commands/use-default-commands-registration/use-default-commands-registration';
import { useCommandPalette } from '@hooks/ui/use-command-palette/use-command-palette';
import { useMemo } from 'react';

export function CommandPaletteInitializer(): null {
  const { user, isLoaded } = useUser();
  const { registerCommand, unregisterCommand } = useCommandPalette();

  const isSuperAdmin = useMemo(() => {
    if (!user || !isLoaded) {
      return false;
    }

    const publicData = getClerkPublicData(user);
    return publicData.isSuperAdmin === true;
  }, [user, isLoaded]);

  useDefaultCommandsRegistration();

  useAdminCommandRegistration({
    isLoaded,
    isSuperAdmin,
    registerCommand,
    unregisterCommand,
  });

  return null;
}
