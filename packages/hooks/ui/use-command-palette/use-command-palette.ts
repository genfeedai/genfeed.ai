/**
 * useCommandPalette Hook
 * React hook for accessing command palette context
 */

'use client';

import type { ICommandPaletteContext } from '@genfeedai/interfaces/ui/command-palette.interface';
import { CommandPaletteContext } from '@contexts/features/command-palette.context';
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
