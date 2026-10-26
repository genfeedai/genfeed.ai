'use client';

import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';

/** What the models list publishes into the settings layout's subbar. */
export interface ModelsToolbar {
  facets: readonly FilterMenuFacet[];
  searchNode: ReactNode;
  onClear: () => void;
}

type SetModelsToolbar = (toolbar: ModelsToolbar | null) => void;

// Two contexts so the list that publishes never re-renders on its own
// publication: it reads only the stable setter.
const ModelsToolbarValueContext = createContext<ModelsToolbar | null>(null);
const ModelsToolbarSetterContext = createContext<SetModelsToolbar | null>(null);

export function ModelsToolbarProvider({ children }: { children: ReactNode }) {
  const [toolbar, setToolbar] = useState<ModelsToolbar | null>(null);

  return (
    <ModelsToolbarSetterContext.Provider value={setToolbar}>
      <ModelsToolbarValueContext.Provider value={toolbar}>
        {children}
      </ModelsToolbarValueContext.Provider>
    </ModelsToolbarSetterContext.Provider>
  );
}

/** The toolbar the active models list has published, if any. */
export function useModelsToolbar(): ModelsToolbar | null {
  return use(ModelsToolbarValueContext);
}

/**
 * Publishes a list's search and filter facets into the models subbar, where
 * they share one Filters menu with the page's own view switch. The toolbar
 * must be memoized by the caller; pass null to publish nothing.
 */
export function usePublishModelsToolbar(toolbar: ModelsToolbar | null): void {
  const setToolbar = use(ModelsToolbarSetterContext);

  useEffect(() => {
    if (!setToolbar) {
      return;
    }
    setToolbar(toolbar);
    return () => setToolbar(null);
  }, [setToolbar, toolbar]);
}
