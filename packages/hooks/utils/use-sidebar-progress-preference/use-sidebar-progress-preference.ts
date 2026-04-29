'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/interfaces';
import { User } from '@genfeedai/models/auth/user.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useMemo, useState } from 'react';

const SIDEBAR_PROGRESS_VISIBLE_STORAGE_KEY = 'genfeed:sidebar:progress-visible';

function getSidebarProgressVisibleStorageKey(
  userId?: string | null,
): string | undefined {
  const normalizedUserId = userId?.trim();

  return normalizedUserId
    ? `${SIDEBAR_PROGRESS_VISIBLE_STORAGE_KEY}:${normalizedUserId}`
    : undefined;
}

function getStoredVisibility(userId?: string | null): boolean | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const storageKey = getSidebarProgressVisibleStorageKey(userId);
  if (!storageKey) {
    return undefined;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (stored === null) {
    return undefined;
  }

  return stored === 'true';
}

export interface UseSidebarProgressPreferenceReturn {
  hideProgress: () => Promise<void>;
  isSaving: boolean;
  isVisible: boolean;
  setVisibility: (next: boolean) => Promise<void>;
  showProgress: () => Promise<void>;
}

export function useSidebarProgressPreference(): UseSidebarProgressPreferenceReturn {
  const { currentUser, mutateUser } = useCurrentUser();
  const currentUserId = currentUser?.id;
  const [isSaving, setIsSaving] = useState(false);
  const [localVisibility, setLocalVisibility] = useState<boolean | undefined>(
    undefined,
  );

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const setVisibility = useCallback(
    async (next: boolean) => {
      setLocalVisibility(next);

      const storageKey = getSidebarProgressVisibleStorageKey(currentUser?.id);

      if (typeof window !== 'undefined' && storageKey) {
        window.localStorage.setItem(storageKey, String(next));
      }

      if (!currentUser) {
        return;
      }

      setIsSaving(true);

      try {
        const service = await getUsersService();
        const patch: Partial<ISetting> = {
          isSidebarProgressVisible: next,
        };

        mutateUser(
          new User({
            ...currentUser,
            settings: {
              ...(currentUser.settings ?? {}),
              ...patch,
            },
          }),
        );

        await service.patchSettings(currentUser.id, patch);
      } catch (error) {
        logger.error('Failed to update sidebar progress visibility', error);
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, getUsersService, mutateUser],
  );

  useEffect(() => {
    const storedVisibility = getStoredVisibility(currentUserId);
    if (storedVisibility !== undefined) {
      setLocalVisibility(storedVisibility);
      return;
    }

    const persistedVisibility = currentUser?.settings?.isSidebarProgressVisible;

    if (persistedVisibility === undefined || persistedVisibility === null) {
      setLocalVisibility(undefined);
      return;
    }

    setLocalVisibility(persistedVisibility);

    if (typeof window !== 'undefined') {
      const storageKey = getSidebarProgressVisibleStorageKey(currentUserId);
      if (storageKey) {
        window.localStorage.setItem(storageKey, String(persistedVisibility));
      }
    }
  }, [currentUser?.settings?.isSidebarProgressVisible, currentUserId]);

  return useMemo(
    () => ({
      hideProgress: () => setVisibility(false),
      isSaving,
      isVisible:
        localVisibility ??
        currentUser?.settings?.isSidebarProgressVisible ??
        true,
      setVisibility,
      showProgress: () => setVisibility(true),
    }),
    [
      currentUser?.settings?.isSidebarProgressVisible,
      isSaving,
      localVisibility,
      setVisibility,
    ],
  );
}
