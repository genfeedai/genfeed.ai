'use client';

import { authClient } from '@genfeedai/auth-client';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';

export function useImpersonateUser(): (user: IUser) => Promise<void> {
  const translate = useTranslations('pages.adminUsers');

  return async (user: IUser) => {
    try {
      const { error } = await authClient.admin.impersonateUser({
        userId: user.id,
      });
      if (error) {
        throw new Error(error.message ?? 'Impersonation request failed');
      }
      // Full navigation (not router.push) so every cached query, token, and
      // org-scoped store rebuilds from the impersonated session.
      window.location.assign(APP_ROUTES.ROOT);
    } catch (error) {
      logger.error('Failed to impersonate user', error);
      NotificationsService.getInstance().error(translate('impersonateFailed'));
    }
  };
}
