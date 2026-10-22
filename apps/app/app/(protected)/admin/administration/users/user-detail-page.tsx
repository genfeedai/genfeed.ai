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

  const displayName = user ? getUserDisplayName(user) : undefined;

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Users}
      onRefresh={() => {
        void refetch();
      }}
      isRefreshing={isFetching && !isLoading}
      primaryAction={
        user && user.platformRole !== PlatformRole.SUPERADMIN ? (
          <Button
            icon={<VenetianMask />}
            label={translate('impersonate')}
            onClick={() => {
              void impersonateUser(user);
            }}
            variant={ButtonVariant.SECONDARY}
          />
        ) : undefined
      }
    >
      {user ? (
        <div className="space-y-4">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar className="size-10" user={user} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">
                {displayName || user.email || EMPTY_VALUE}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {displayName
                  ? user.email || EMPTY_VALUE
                  : user.handle || EMPTY_VALUE}
              </p>
            </div>
          </div>
          <UserDetails className="lg:grid-cols-2" user={user} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isLoading ? null : translate('notFound')}
        </p>
      )}
    </AdminPageShell>
  );
}
