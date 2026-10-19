'use client';

import { PlatformRole } from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IUser } from '@genfeedai/contracts/interfaces';
import { DATE_FORMATS, formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { useQuery } from '@tanstack/react-query';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Users, VenetianMask } from 'lucide-react';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useImpersonateUser } from './use-impersonate-user';
import UserAvatar from './user-avatar';
import UserDetailSheet from './user-detail-sheet';
import { EMPTY_VALUE, getUserDisplayName } from './user-display.helpers';
import UserEmail from './user-email';

function formatUserDate(value: string | Date | null | undefined): string {
  return formatDate(value, DATE_FORMATS.DISPLAY_DATETIME) || EMPTY_VALUE;
}

export default function UsersList() {
  const translate = useTranslations('pages.adminUsers');
  const impersonateUser = useImpersonateUser();
  const [selectedUser, setSelectedUser] = useState<IUser | null>(null);
  const currentPage = Number(useSearchParams().get('page')) || 1;
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const {
    data: users,
    isLoading,
    isFetching,
    error: usersError,
    refetch,
  } = useQuery<IUser[]>({
    queryKey: ['admin-users', currentPage],
    queryFn: async () => {
      const service = await getUsersService();
      return service.findAll({ limit: ITEMS_PER_PAGE, page: currentPage });
    },
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (usersError) {
      logger.error('GET /users failed', usersError);
    }
  }, [usersError]);

  const refresh = () => {
    refetch();
  };

  const columns: TableColumn<IUser>[] = [
    {
      header: translate('columns.name'),
      key: 'name',
      render: (u: IUser) => (
        <NextLink
          aria-label={getUserDisplayName(u) ?? u.email}
          className="flex min-w-0 items-center gap-2.5 hover:underline"
          href={`${APP_ROUTES.ADMIN.ADMINISTRATION.USERS}/${u.id}`}
        >
          <UserAvatar user={u} />
          <span className="truncate">
            {getUserDisplayName(u) ?? EMPTY_VALUE}
          </span>
        </NextLink>
      ),
    },
    {
      header: translate('columns.email'),
      key: 'email',
      render: (u: IUser) => <UserEmail email={u.email} />,
    },
    {
      header: translate('columns.joined'),
      key: 'createdAt',
      render: (u: IUser) => formatUserDate(u.createdAt),
    },
    {
      header: translate('columns.lastConnected'),
      key: 'lastActiveAt',
      render: (u: IUser) => formatUserDate(u.lastActiveAt),
    },
  ];

  const actions: TableAction<IUser>[] = [
    {
      icon: <VenetianMask />,
      // The admin plugin rejects impersonating other admins, so hide the
      // action instead of offering a guaranteed 403 (this also covers the
      // operator's own row — superadmin-only surface, superadmin operator).
      isVisible: (u: IUser) => u.platformRole !== PlatformRole.SUPERADMIN,
      onClick: (u: IUser) => {
        void impersonateUser(u);
      },
      tooltip: translate('impersonate'),
    },
  ];

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Users}
      onRefresh={() => refresh()}
      isRefreshing={isRefreshing}
    >
      <AppTable<IUser>
        items={users || []}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(u) => u.id}
        onRowClick={setSelectedUser}
        emptyLabel={translate('empty')}
      />
      <div className="mt-4">
        <AutoPagination showTotal totalLabel={translate('totalLabel')} />
      </div>
      <UserDetailSheet
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onImpersonate={(u) => {
          void impersonateUser(u);
        }}
      />
    </AdminPageShell>
  );
}
