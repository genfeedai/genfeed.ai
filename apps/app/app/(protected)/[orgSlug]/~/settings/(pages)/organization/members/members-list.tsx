'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES, EMPTY_STATES, ITEMS_PER_PAGE } from '@genfeedai/constants';
import { ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';
import {
  getSeatLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Member } from '@models/organization/member.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MembersService } from '@services/organization/members.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import AppTable from '@ui/display/table/Table';
import { LazyModalMember } from '@ui/lazy/modal/LazyModal';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { HiOutlineLockClosed, HiUserPlus } from 'react-icons/hi2';

function formatTierLabel(tier: string | null): string {
  if (!tier) {
    return 'a paid plan';
  }

  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function MembersListContent() {
  const notificationsService = NotificationsService.getInstance();
  const { organizationId, settings } = useBrand();
  const { orgHref } = useOrgUrl();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const seatLimit = getSeatLimitForTier(settings?.subscriptionTier);
  const upgradeTier = getUpgradeTierForLimit(
    'seats',
    settings?.subscriptionTier,
  );
  const isTeamSubscriptionLocked = seatLimit === 1 && upgradeTier !== null;

  const getMembersService = useAuthedService(
    useCallback((token: string) => MembersService.getInstance(token), []),
  );

  const [members, setMembers] = useState<Member[] | null>(null);

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
    if (!organizationId || isTeamSubscriptionLocked) {
      setMembers([]);
      return;
    }

    setMembers(null);

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
      setMembers([]);
    }
  }, [
    currentPage,
    getMembersService,
    isTeamSubscriptionLocked,
    notificationsService,
    organizationId,
  ]);

  useEffect(() => {
    findAllMembers();
  }, [findAllMembers]);

  const upgradeTierLabel = formatTierLabel(upgradeTier);

  return (
    <div className="space-y-4">
      {!isTeamSubscriptionLocked ? (
        <div className="flex justify-end">
          <Button
            onClick={() => openModal(ModalEnum.MEMBER)}
            icon={<HiUserPlus className="size-4" />}
            label="Invite Member"
          />
        </div>
      ) : null}

      {isTeamSubscriptionLocked ? (
        <CardEmpty
          actions={
            <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.BILLING)}>
                Upgrade to {upgradeTierLabel}
              </Link>
            </Button>
          }
          description={`Your current plan is a solo workspace. Upgrade to ${upgradeTierLabel} to invite members and collaborate with your team.`}
          icon={HiOutlineLockClosed}
          label={`Unlock team members with ${upgradeTierLabel}`}
        />
      ) : (
        <>
          <AppTable<Member>
            items={members ?? []}
            columns={columns}
            actions={[]}
            isLoading={members === null}
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
        </>
      )}
    </div>
  );
}

export default function MembersList() {
  return (
    <Suspense fallback={null}>
      <MembersListContent />
    </Suspense>
  );
}
