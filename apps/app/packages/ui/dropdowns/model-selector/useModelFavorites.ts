'use client';

import { useOptionalUser } from '@contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const MODEL_FAVORITES_STORAGE_KEY = 'genfeed:model-favorite-keys';

type FavoriteModelSettingsPatch = Partial<ISetting> & {
  favoriteModelKeys?: string[];
};

function readStoredFavoriteModelKeys(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function writeStoredFavoriteModelKeys(favoriteModelKeys: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(favoriteModelKeys),
    );
  } catch {
    // Storage unavailable or full. Keep UI state in memory.
  }
}

export function useModelFavorites(): {
  favoriteModelKeys: string[];
  onFavoriteToggle: (modelKey: string) => void;
} {
  const userContext = useOptionalUser();
  const currentUser = userContext?.currentUser ?? null;
  const mutateUser = userContext?.mutateUser;
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );
  const [favoriteModelKeys, setFavoriteModelKeys] = useState<string[]>(
    readStoredFavoriteModelKeys,
  );
  const isMigratingStoredFavoritesRef = useRef(false);

  const persistedFavoriteModelKeys = useMemo(() => {
    const settings = currentUser?.settings as
      | FavoriteModelSettingsPatch
      | undefined;

    return Array.isArray(settings?.favoriteModelKeys)
      ? settings.favoriteModelKeys.filter(
          (value): value is string => typeof value === 'string',
        )
      : null;
  }, [currentUser?.settings]);

  const hasPersistedFavoriteModelKeys = useMemo(
    () =>
      Object.hasOwn(currentUser?.settings ?? {}, 'favoriteModelKeys') &&
      persistedFavoriteModelKeys !== null,
    [currentUser?.settings, persistedFavoriteModelKeys],
  );

  useEffect(() => {
    if (persistedFavoriteModelKeys !== null) {
      setFavoriteModelKeys(persistedFavoriteModelKeys);
      return;
    }

    if (!currentUser) {
      setFavoriteModelKeys(readStoredFavoriteModelKeys());
    }
  }, [currentUser, persistedFavoriteModelKeys]);

  useEffect(() => {
    writeStoredFavoriteModelKeys(favoriteModelKeys);
  }, [favoriteModelKeys]);

  const persistFavoriteModelKeys = useCallback(
    async (nextFavoriteModelKeys: string[]) => {
      if (!currentUser) {
        return;
      }

      try {
        const service = await getUsersService();
        const patch: FavoriteModelSettingsPatch = {
          favoriteModelKeys: nextFavoriteModelKeys,
        };

        await service.patchSettings(currentUser.id, patch);

        mutateUser?.(
          new User({
            ...currentUser,
            settings: {
              ...(currentUser.settings ?? {}),
              ...patch,
            },
          }),
        );
      } catch (error) {
        logger.error('Failed to persist favorite model keys', error);
      }
    },
    [currentUser, getUsersService, mutateUser],
  );

  useEffect(() => {
    if (
      !currentUser ||
      hasPersistedFavoriteModelKeys ||
      isMigratingStoredFavoritesRef.current
    ) {
      return;
    }

    const storedFavoriteModelKeys = readStoredFavoriteModelKeys();
    if (storedFavoriteModelKeys.length === 0) {
      return;
    }

    isMigratingStoredFavoritesRef.current = true;

    void persistFavoriteModelKeys(storedFavoriteModelKeys).finally(() => {
      isMigratingStoredFavoritesRef.current = false;
    });
  }, [currentUser, hasPersistedFavoriteModelKeys, persistFavoriteModelKeys]);

  const onFavoriteToggle = useCallback(
    (modelKey: string) => {
      setFavoriteModelKeys((currentKeys) => {
        const nextFavoriteModelKeys = currentKeys.includes(modelKey)
          ? currentKeys.filter((key) => key !== modelKey)
          : [...currentKeys, modelKey];

        void persistFavoriteModelKeys(nextFavoriteModelKeys);
        return nextFavoriteModelKeys;
      });
    },
    [persistFavoriteModelKeys],
  );

  return {
    favoriteModelKeys,
    onFavoriteToggle,
  };
}
