'use client';

import {
  readLocalStorageStringArray,
  writeLocalStorageStringArray,
} from '@genfeedai/helpers/data/storage/storage.helper';

import { useCallback, useState } from 'react';

export const MODEL_RECENTS_STORAGE_KEY = 'genfeed:model-recent-keys';
export const MAX_RECENT_MODEL_KEYS = 4;

export function readStoredRecentModelKeys(): string[] {
  return readLocalStorageStringArray(MODEL_RECENTS_STORAGE_KEY).slice(
    0,
    MAX_RECENT_MODEL_KEYS,
  );
}

function writeStoredRecentModelKeys(keys: string[]): void {
  writeLocalStorageStringArray(MODEL_RECENTS_STORAGE_KEY, keys);
}

/**
 * Recency is a per-device scanning aid, not an account preference — unlike
 * favorites it never round-trips to user settings. The picker owns it directly
 * so no host has to plumb a prop it cannot observe anyway: only the picker
 * knows when a model was actually chosen.
 */
export function useModelRecents(): {
  recentModelKeys: string[];
  onModelUsed: (modelKey: string) => void;
} {
  const [recentModelKeys, setRecentModelKeys] = useState<string[]>(
    readStoredRecentModelKeys,
  );

  const onModelUsed = useCallback((modelKey: string) => {
    setRecentModelKeys((currentKeys) => {
      const nextRecentModelKeys = [
        modelKey,
        ...currentKeys.filter((key) => key !== modelKey),
      ].slice(0, MAX_RECENT_MODEL_KEYS);

      writeStoredRecentModelKeys(nextRecentModelKeys);
      return nextRecentModelKeys;
    });
  }, []);

  return {
    onModelUsed,
    recentModelKeys,
  };
}
