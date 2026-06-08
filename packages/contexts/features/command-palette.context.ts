import type { ICommandPaletteContext } from '@genfeedai/interfaces/ui/command-palette.interface';
import { createContext } from 'react';

export const CommandPaletteContext =
  createContext<ICommandPaletteContext | null>(null);
