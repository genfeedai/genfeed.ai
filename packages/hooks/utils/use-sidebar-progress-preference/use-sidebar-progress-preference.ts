'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useCallback, useMemo, useState } from 'react';

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

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const setVisibility = useCallback(
    async (next: boolean) => {
      if (!currentUser) {
        return;
      }

      setIsSaving(true);

      try {
        const service = await getUsersService();
        const patch: Partial<ISetting> = {
          isSidebarProgressVisible: next,
        };

        await service.patchSettings(currentUser.id, patch);

        mutateUser(
          new User({
            ...currentUser,
            settings: {
              ...(currentUser.settings ?? {}),
              ...patch,
            },
          }),
        );
      } catch (error) {
        logger.error('Failed to update sidebar progress visibility', error);
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, getUsersService, mutateUser],
  );

  return useMemo(
    () => ({
      hideProgress: () => setVisibility(false),
      isSaving,
      isVisible: currentUser?.settings?.isSidebarProgressVisible ?? true,
      setVisibility,
      showProgress: () => setVisibility(true),
    }),
    [currentUser?.settings?.isSidebarProgressVisible, isSaving, setVisibility],
  );
}
