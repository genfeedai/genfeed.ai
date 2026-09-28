'use client';

import { ViewType } from '@genfeedai/contracts';
import {
  readLocalStorageItem,
  writeLocalStorageItem,
} from '@genfeedai/helpers/data/storage/storage.helper';
import type { CollectionViewType } from '@genfeedai/props/ui/collection/collection.props';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY_PREFIX = 'genfeed:collection-view';

const COLLECTION_VIEWS: readonly CollectionViewType[] = [
  ViewType.LIST,
  ViewType.GRID,
];

export function getCollectionViewStorageKey(surface: string): string {
  return `${STORAGE_KEY_PREFIX}:${surface}`;
}

function parseCollectionView(
  value: string | null,
): CollectionViewType | undefined {
  return COLLECTION_VIEWS.find((view) => view === value);
}

export interface UseCollectionViewPreferenceOptions {
  /** Stable surface id, e.g. `automation.agents`. One preference per surface. */
  surface: string;
  /** List for text-first collections, grid for visual-first ones. */
  defaultView: CollectionViewType;
}

export interface UseCollectionViewPreferenceReturn {
  view: CollectionViewType;
  setView: (view: CollectionViewType) => void;
}

/**
 * Remembers the viewer's list/grid choice per collection surface as a local
 * preference. The first render uses the surface default so server and client
 * markup match; the stored choice applies after mount.
 */
export function useCollectionViewPreference({
  surface,
  defaultView,
}: UseCollectionViewPreferenceOptions): UseCollectionViewPreferenceReturn {
  const [view, setViewState] = useState<CollectionViewType>(defaultView);

  useEffect(() => {
    const stored = parseCollectionView(
      readLocalStorageItem(getCollectionViewStorageKey(surface)),
    );
    setViewState(stored ?? defaultView);
  }, [defaultView, surface]);

  const setView = useCallback(
    (next: CollectionViewType) => {
      setViewState(next);
      writeLocalStorageItem(getCollectionViewStorageKey(surface), next);
    },
    [surface],
  );

  return { setView, view };
}
