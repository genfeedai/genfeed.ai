'use client';

import type { ReactNode } from 'react';
import { createContext, use } from 'react';

interface IngredientsHeaderContextValue {
  headerMeta?: ReactNode;
  setHeaderMeta: (meta?: ReactNode) => void;
  /**
   * Library pins its filters and publishes selection actions into
   * `selectionSlot` instead of floating a second bar over the grid.
   */
  hostsSelectionActions?: boolean;
  selectionSlot?: HTMLElement | null;
}

const IngredientsHeaderContext = createContext<
  IngredientsHeaderContextValue | undefined
>(undefined);

export function IngredientsHeaderProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: IngredientsHeaderContextValue;
}) {
  return (
    <IngredientsHeaderContext.Provider value={value}>
      {children}
    </IngredientsHeaderContext.Provider>
  );
}

export function useIngredientsHeaderContext() {
  const context = use(IngredientsHeaderContext);

  if (context === undefined) {
    throw new Error(
      'useIngredientsHeaderContext must be used within an IngredientsHeaderProvider',
    );
  }

  return context;
}
