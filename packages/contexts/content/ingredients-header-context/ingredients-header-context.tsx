'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

interface IngredientsHeaderContextValue {
  headerMeta?: ReactNode;
  setHeaderMeta: (meta?: ReactNode) => void;
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
  const context = useContext(IngredientsHeaderContext);

  if (context === undefined) {
    throw new Error(
      'useIngredientsHeaderContext must be used within an IngredientsHeaderProvider',
    );
  }

  return context;
}
