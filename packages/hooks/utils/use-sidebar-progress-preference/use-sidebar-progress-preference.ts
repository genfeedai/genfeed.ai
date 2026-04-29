'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/interfaces';
import { User } from '@genfeedai/models/auth/user.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useMemo, useState } from 'react';

const SIDEBAR_PROGRESS_VISIBLE_STORAGE_KEY = 'genfeed:sidebar:progress-visible';

function getStoredVisibility(): boolean | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const stored = window.localStorage.getItem(
    SIDEBAR_PROGRESS_VISIBLE_STORAGE_KEY,
  );

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
  const [isSaving, setIsSaving] = useState(false);
  const [localVisibility, setLocalVisibility] = useState<boolean | undefined>(
    getStoredVisibility,
  );

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const setVisibility = useCallback(
    async (next: boolean) => {
      setLocalVisibility(next);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          SIDEBAR_PROGRESS_VISIBLE_STORAGE_KEY,
          String(next),
        );
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
    const persistedVisibility = currentUser?.settings?.isSidebarProgressVisible;

    if (persistedVisibility === undefined || persistedVisibility === null) {
      return;
    }

    if (localVisibility !== undefined && persistedVisibility) {
      return;
    }

    setLocalVisibility(persistedVisibility);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SIDEBAR_PROGRESS_VISIBLE_STORAGE_KEY,
        String(persistedVisibility),
      );
    }
  }, [currentUser?.settings?.isSidebarProgressVisible, localVisibility]);

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
