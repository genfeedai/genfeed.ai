'use client';

import {
  PUBLISHING_POSTS_VIEW_MODES,
  type PublishingPostsViewMode,
} from '@genfeedai/constants';
import { useCallback } from 'react';

const STORAGE_KEY_PREFIX = 'genfeed:publishing:posts-view';

function getStorageKey(brandId?: string | null): string | undefined {
  const normalizedBrandId = brandId?.trim();

  return normalizedBrandId
    ? `${STORAGE_KEY_PREFIX}:${normalizedBrandId}`
    : undefined;
}

export interface UsePublishingPostsViewPreferenceReturn {
  getStoredView: () => PublishingPostsViewMode | undefined;
  storeView: (view: PublishingPostsViewMode) => void;
}

/**
 * Remembers the last Posts view (list, board, or grid) per brand. The URL stays the
 * source of truth for the active view — this only seeds a redirect when a
 * brand's Posts URL carries no explicit `view` param.
 */
export function usePublishingPostsViewPreference(
  brandId?: string | null,
): UsePublishingPostsViewPreferenceReturn {
  const getStoredView = useCallback((): PublishingPostsViewMode | undefined => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const storageKey = getStorageKey(brandId);
    if (!storageKey) {
      return undefined;
    }

    const stored = window.localStorage.getItem(storageKey);

    return PUBLISHING_POSTS_VIEW_MODES.find((mode) => mode === stored);
  }, [brandId]);

  const storeView = useCallback(
    (view: PublishingPostsViewMode) => {
      if (typeof window === 'undefined') {
        return;
      }

      const storageKey = getStorageKey(brandId);
      if (!storageKey) {
        return;
      }

      window.localStorage.setItem(storageKey, view);
    },
    [brandId],
  );

  return { getStoredView, storeView };
}
