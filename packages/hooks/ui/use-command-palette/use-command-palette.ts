/**
 * useCommandPalette Hook
 * React hook for accessing command palette context
 */

'use client';

import { CommandPaletteContext } from '@contexts/features/command-palette.context';
import type { ICommandPaletteContext } from '@genfeedai/interfaces/ui/command-palette.interface';
import { useContext } from 'react';

export function useCommandPalette(): ICommandPaletteContext {
  const context = useContext(CommandPaletteContext);

  if (!context) {
    throw new Error(
      'useCommandPalette must be used within CommandPaletteProvider',
    );
  }

  return context;
}
