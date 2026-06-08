'use client';

import type {
  IFontFamily,
  IModel,
  IPreset,
  ITag,
  ITraining,
} from '@genfeedai/interfaces';
import { createContext, useContext } from 'react';

export interface PromptBarContextValue {
  models: IModel[];
  presets: IPreset[];
  fontFamilies: IFontFamily[];
  tags: ITag[];
  trainings: ITraining[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  onRefresh?: (callback: () => void) => void;
}

export const PromptBarContext = createContext<
  PromptBarContextValue | undefined
>(undefined);

export function usePromptBarContext(): PromptBarContextValue {
  const context = useContext(PromptBarContext);
  if (context === undefined) {
    throw new Error(
      'usePromptBarContext must be used within a PromptBarProvider',
    );
  }
  return context;
}
