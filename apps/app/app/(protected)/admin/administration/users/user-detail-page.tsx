'use client';

import { ButtonVariant, PlatformRole } from '@genfeedai/contracts';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useQuery } from '@tanstack/react-query';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Button } from '@ui/primitives/button';
import { Users, VenetianMask } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { readRouteParam } from '@/lib/route-params';
import { useImpersonateUser } from './use-impersonate-user';
import UserAvatar from './user-avatar';
import UserDetails from './user-details';
import { EMPTY_VALUE, getUserDisplayName } from './user-display.helpers';

export default function UserDetailPage() {
  const translate = useTranslations('pages.adminUsers');
  const params = useParams<{ id: string }>();
  const userId = readRouteParam(params.id);
  const impersonateUser = useImpersonateUser();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const {
    data: user,
    isLoading,
    isFetching,
    error: userError,
    refetch,
  } = useQuery<IUser>({
    queryFn: async ({ signal }) => {
      const service = await getUsersService();
      return service.findOne(userId, {}, signal);
    },
    queryKey: ['admin-user', userId],
  });

  useEffect(() => {
    if (userError) {
      logger.error('GET /users/:id failed', userError);
    }
  }, [userError]);

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Users}
      onRefresh={() => {
        void refetch();
      }}
      isRefreshing={isFetching && !isLoading}
    >
      {user ? (
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="flex items-center gap-4">
            <UserAvatar className="size-14" user={user} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-semibold">
                {getUserDisplayName(user) ?? EMPTY_VALUE}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {user.email || EMPTY_VALUE}
              </p>
            </div>
            {user.platformRole !== PlatformRole.SUPERADMIN ? (
              <Button
                icon={<VenetianMask />}
                label={translate('impersonate')}
                onClick={() => {
                  void impersonateUser(user);
                }}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
          </div>
          <UserDetails user={user} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isLoading ? null : translate('notFound')}
        </p>
      )}
    </AdminPageShell>
  );
}
