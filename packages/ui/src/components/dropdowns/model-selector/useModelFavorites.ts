'use client';

import { useOptionalUser } from '@genfeedai/contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/contracts/interfaces';
import {
  readLocalStorageStringArray,
  writeLocalStorageStringArray,
} from '@genfeedai/helpers/data/storage/storage.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { User } from '@genfeedai/models/auth/user.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const MODEL_FAVORITES_STORAGE_KEY = 'genfeed:model-favorite-keys';

type FavoriteModelSettingsPatch = Partial<ISetting> & {
  favoriteModelKeys?: string[];
};

function readStoredFavoriteModelKeys(): string[] {
  return readLocalStorageStringArray(MODEL_FAVORITES_STORAGE_KEY);
}

function writeStoredFavoriteModelKeys(keys: string[]): void {
  writeLocalStorageStringArray(MODEL_FAVORITES_STORAGE_KEY, keys);
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

  // use-effect-audit: ignore reads browser storage after mount so server and client markup match
  useEffect(() => {
    if (persistedFavoriteModelKeys !== null) {
      setFavoriteModelKeys(persistedFavoriteModelKeys);
      return;
    }

    if (!currentUser) {
      setFavoriteModelKeys(readStoredFavoriteModelKeys());
    }
  }, [currentUser, persistedFavoriteModelKeys]);

  // use-effect-audit: ignore mirrors favorites into local storage
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

  // use-effect-audit: ignore migrates stored favorites to the server once
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
