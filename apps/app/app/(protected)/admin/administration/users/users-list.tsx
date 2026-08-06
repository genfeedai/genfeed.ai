'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { authClient } from '@genfeedai/auth-client';
import { APP_ROUTES } from '@genfeedai/constants';
import { PlatformRole } from '@genfeedai/enums';
import type { IUser } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { UsersService } from '@services/organization/users.service';
import { useQuery } from '@tanstack/react-query';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Users, VenetianMask } from 'lucide-react';
import { useEffect } from 'react';

export default function UsersList() {
  const notificationsService = NotificationsService.getInstance();
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
    queryKey: ['admin-users'],
    queryFn: async () => {
      const service = await getUsersService();
      return service.findAll();
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

  const handleImpersonate = async (user: IUser) => {
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
      notificationsService.error('Failed to impersonate user');
    }
  };

  const columns: TableColumn<IUser>[] = [
    {
      header: 'Name',
      key: 'firstName',
      render: (u: IUser) => `${u.firstName} ${u.lastName}`,
    },
    { header: 'Email', key: 'email' },
    {
      header: 'Joined',
      key: 'createdAt',
      render: (u: IUser) => new Date(u.createdAt).toLocaleString(),
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
        void handleImpersonate(u);
      },
      tooltip: 'Impersonate',
    },
  ];

  return (
    <Container
      label="Users"
      description="Manage user accounts, roles, and permissions across the platform"
      icon={Users}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      <AppTable<IUser>
        items={users || []}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(u) => u.id}
        emptyLabel="No users found"
      />
    </Container>
  );
}
