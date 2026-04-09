'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/interfaces';
import { User } from '@genfeedai/models/auth/user.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useMemo, useState } from 'react';

export interface UseSidebarProgressCollapsedPreferenceReturn {
  hasPersistedPreference: boolean;
  isCollapsed: boolean;
  isSaving: boolean;
  setCollapsed: (next: boolean) => Promise<void>;
}

export function useSidebarProgressCollapsedPreference(): UseSidebarProgressCollapsedPreferenceReturn {
  const { currentUser, mutateUser } = useCurrentUser();
  const [isSaving, setIsSaving] = useState(false);

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const setCollapsed = useCallback(
    async (next: boolean) => {
      if (!currentUser) {
        return;
      }

      setIsSaving(true);

      try {
        const service = await getUsersService();
        const patch: Partial<ISetting> = {
          isSidebarProgressCollapsed: next,
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
        logger.error(
          'Failed to update sidebar progress collapsed state',
          error,
        );
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, getUsersService, mutateUser],
  );

  return useMemo(
    () => ({
      hasPersistedPreference: Object.hasOwn(
        currentUser?.settings ?? {},
        'isSidebarProgressCollapsed',
      ),
      isCollapsed: currentUser?.settings?.isSidebarProgressCollapsed ?? false,
      isSaving,
      setCollapsed,
    }),
    [currentUser?.settings, isSaving, setCollapsed],
  );
}
