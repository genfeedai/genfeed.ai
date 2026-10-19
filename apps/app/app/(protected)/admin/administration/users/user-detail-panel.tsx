'use client';

import { ButtonVariant, PlatformRole } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { AdminUserDetailPanelProps } from '@props/admin/admin-user.props';
import { Button } from '@ui/primitives/button';
import { VenetianMask } from 'lucide-react';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import UserDetails from './user-details';

/** Quick look at a user from the list; the full page lives at `.../users/:id`. */
export default function UserDetailPanel({
  user,
  onImpersonate,
}: AdminUserDetailPanelProps) {
  const translate = useTranslations('pages.adminUsers');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <NextLink
            href={`${APP_ROUTES.ADMIN.ADMINISTRATION.USERS}/${user.id}`}
          >
            {translate('openProfile')}
          </NextLink>
        </Button>
        {user.platformRole !== PlatformRole.SUPERADMIN ? (
          <Button
            icon={<VenetianMask />}
            label={translate('impersonate')}
            onClick={() => onImpersonate(user)}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
      </div>

      <UserDetails user={user} />
    </div>
  );
}
