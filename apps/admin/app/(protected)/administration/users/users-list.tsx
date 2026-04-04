'use client';

import type { IUser } from '@genfeedai/interfaces';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { HiOutlineUserGroup } from 'react-icons/hi2';

export default function UsersList() {
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const {
    data: users,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<IUser[]>(
    async () => {
      const service = await getUsersService();
      return service.findAll();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /users failed', error);
      },
    },
  );

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

  return (
    <Container
      label="Users"
      description="Manage user accounts, roles, and permissions across the platform"
      icon={HiOutlineUserGroup}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      <AppTable<IUser>
        items={users || []}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(u) => u.id}
        emptyLabel="No users found"
      />
    </Container>
  );
}
