import type { ICommandPaletteContext } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { createContext } from 'react';

export const CommandPaletteContext =
  createContext<ICommandPaletteContext | null>(null);
