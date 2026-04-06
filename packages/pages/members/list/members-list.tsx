'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { EMPTY_STATES, ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ModalEnum } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Member } from '@models/organization/member.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MembersService } from '@services/organization/members.service';
import Button from '@ui/buttons/base/Button';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { LazyModalMember } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineUsers, HiUserPlus } from 'react-icons/hi2';

export default function MembersList() {
  const notificationsService = NotificationsService.getInstance();
  const { organizationId } = useBrand();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams?.get('page')) || 1;

  const getMembersService = useAuthedService(
    useCallback((token: string) => MembersService.getInstance(token), []),
  );

  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const columns: TableColumn<Member>[] = [
    {
      header: 'Name',
      key: 'userFullName',
      render: (member: Member) => member.userFullName || '-',
    },
    {
      header: 'Email',
      key: 'userEmail',
      render: (member: Member) => member.userEmail || '-',
    },
    {
      header: 'Role',
      key: 'roleLabel',
      render: (member: Member) => member.roleLabel || '-',
    },
    {
      header: 'Joined',
      key: 'createdAt',
      render: (member: Member) =>
        member.createdAt ? formatDate(member.createdAt) : '-',
    },
  ];

  const findAllMembers = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    setIsLoading(true);

    try {
      const service = await getMembersService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        organization: organizationId,
        page: currentPage,
      };

      const data = await service.findAll(query);
      setMembers(data);
      logger.info('GET /members success', data);
    } catch (error) {
      logger.error('GET /members failed', error);
      notificationsService.error('Failed to load members');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, getMembersService, notificationsService, organizationId]);

  useEffect(() => {
    findAllMembers();
  }, [findAllMembers]);

  return (
    <Container
      label="Team Members"
      icon={HiOutlineUsers}
      right={
        <Button
          onClick={() => openModal(ModalEnum.MEMBER)}
          icon={<HiUserPlus className="w-4 h-4" />}
          label="Invite Member"
        />
      }
    >
      <AppTable<Member>
        items={members}
        columns={columns}
        actions={[]}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        emptyLabel={EMPTY_STATES.MEMBERS_FOUND}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel="members" />
      </div>

      <LazyModalMember
        organizationId={organizationId ?? ''}
        onConfirm={findAllMembers}
      />
    </Container>
  );
}
