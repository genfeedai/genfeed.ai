'use client';

import { useDefaultCommandsRegistration } from '@/hooks/commands/use-default-commands-registration/use-default-commands-registration';

export function CommandPaletteInitializer(): null {
  useDefaultCommandsRegistration();
  return null;
}

export default CommandPaletteInitializer;
