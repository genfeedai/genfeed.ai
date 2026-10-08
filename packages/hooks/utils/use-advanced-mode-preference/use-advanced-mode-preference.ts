'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import { User } from '@genfeedai/models/auth/user.model';
import { logger } from '@genfeedai/services/core/logger.service';
import { UsersService } from '@genfeedai/services/organization/users.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useMemo } from 'react';

export interface UseAdvancedModePreferenceReturn {
  /** Manual model choice is offered in the prompt bar; otherwise models are Auto. */
  isAdvancedMode: boolean;
  /** The signed-in user's settings have loaded, so `isAdvancedMode` is their saved value. */
  isLoaded: boolean;
  setAdvancedMode: (next: boolean) => Promise<void>;
}

/** The signed-in user's Advanced Mode, saved on their settings row. */
export function useAdvancedModePreference(): UseAdvancedModePreferenceReturn {
  const { currentUser, mutateUser } = useCurrentUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const setAdvancedMode = useCallback(
    async (next: boolean) => {
      if (!currentUser) {
        return;
      }

      const withValue = (value: boolean) =>
        new User({
          ...currentUser,
          settings: { ...(currentUser.settings ?? {}), isAdvancedMode: value },
        });
      const previous = currentUser.settings?.isAdvancedMode ?? false;

      mutateUser(withValue(next));
      try {
        const service = await getUsersService();
        await service.patchMeSettings({ isAdvancedMode: next });
      } catch (error) {
        logger.error('Failed to update Advanced Mode', error);
        mutateUser(withValue(previous));
      }
    },
    [currentUser, getUsersService, mutateUser],
  );

  return useMemo(
    () => ({
      isAdvancedMode: currentUser?.settings?.isAdvancedMode ?? false,
      isLoaded: Boolean(currentUser?.settings),
      setAdvancedMode,
    }),
    [currentUser?.settings, setAdvancedMode],
  );
}
