'use client';

import type {
  IIngredientsContextValue,
  IProviderWithValue,
} from '@cloud/interfaces/providers/providers.interface';
import { createContext, useContext } from 'react';

const IngredientsContext = createContext<IIngredientsContextValue | undefined>(
  undefined,
);

export function IngredientsProvider({
  children,
  value,
}: IProviderWithValue<IIngredientsContextValue>) {
  return (
    <IngredientsContext.Provider value={value}>
      {children}
    </IngredientsContext.Provider>
  );
}

export function useIngredientsContext() {
  const context = useContext(IngredientsContext);
  if (context === undefined) {
    throw new Error(
      'useIngredientsContext must be used within an IngredientsProvider',
    );
  }
  return context;
}
