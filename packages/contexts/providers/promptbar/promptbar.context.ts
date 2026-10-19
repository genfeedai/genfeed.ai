'use client';

import type {
  IFontFamily,
  IModel,
  IPreset,
  ITag,
  ITraining,
} from '@genfeedai/contracts/interfaces';
import { createContext, useContext, useEffect } from 'react';

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
  /** Starts the catalog fetch; the provider stays idle until a consumer asks. */
  requestLoad?: () => void;
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
  const { requestLoad } = context;
  useEffect(() => {
    requestLoad?.();
  }, [requestLoad]);
  return context;
}
