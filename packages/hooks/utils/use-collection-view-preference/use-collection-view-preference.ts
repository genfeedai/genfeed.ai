'use client';

import { ViewType } from '@genfeedai/contracts';
import {
  readLocalStorageItem,
  writeLocalStorageItem,
} from '@genfeedai/helpers/data/storage/storage.helper';
import type {
  CollectionViewType,
  UseCollectionViewPreferenceOptions,
  UseCollectionViewPreferenceReturn,
} from '@genfeedai/props/ui/collection/collection.props';
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

// The view choice is a convenience, not state: blocked or full storage must
// leave the collection on its in-memory view instead of throwing.
function readStoredView(surface: string): CollectionViewType | undefined {
  try {
    return parseCollectionView(
      readLocalStorageItem(getCollectionViewStorageKey(surface)),
    );
  } catch {
    return undefined;
  }
}

function storeView(surface: string, view: CollectionViewType): void {
  try {
    writeLocalStorageItem(getCollectionViewStorageKey(surface), view);
  } catch {
    // Keep the in-memory choice for this session.
  }
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
    setViewState(readStoredView(surface) ?? defaultView);
  }, [defaultView, surface]);

  const setView = useCallback(
    (next: CollectionViewType) => {
      setViewState(next);
      storeView(surface, next);
    },
    [surface],
  );

  return { setView, view };
}
