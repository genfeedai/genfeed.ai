'use client';

import type {
  IElementBlacklist,
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  ISound,
} from '@genfeedai/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/interfaces/utils/filters.interface';
import { createContext, useContext } from 'react';

export interface ElementsContextValue {
  moods: IElementMood[];
  styles: IElementStyle[];
  cameras: IElementCamera[];
  blacklists: IElementBlacklist[];
  sounds: ISound[];
  scenes: IElementScene[];
  lightings: IElementLighting[];
  lenses: IElementLens[];
  cameraMovements: IElementCameraMovement[];
  isLoading: boolean;
  error: Error | null;
  filters: IFiltersState;
  query: IFilters;
  isRefreshing: boolean;
  setFilters: (filters: IFiltersState) => void;
  setQuery: (query: IFilters) => void;
  setIsRefreshing: (isRefreshing: boolean) => void;
  refetch: () => Promise<void>;
  onRefresh?: (callback: () => Promise<void> | void) => void;
}

export const ElementsContext = createContext<ElementsContextValue | undefined>(
  undefined,
);

export function useElementsContext(): ElementsContextValue {
  const context = useContext(ElementsContext);
  if (context === undefined) {
    throw new Error(
      'useElementsContext must be used within an ElementsProvider',
    );
  }
  return context;
}
