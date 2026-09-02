'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, MemberRole, ModalEnum } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  EMPTY_STATES,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IMemberInvitation,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import {
  getSeatLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
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
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Ban, Lock, RotateCw, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

function formatTierLabel(tier: string | null): string {
  if (!tier) {
    return 'a paid plan';
  }

  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatInvitationStatus(status: IMemberInvitation['status']): string {
  if (!status) {
    return 'Pending';
  }

  return status
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function invitationStatusVariant(
  status: IMemberInvitation['status'],
): 'default' | 'destructive' | 'secondary' | 'success' | 'warning' {
  switch (status) {
    case 'accepted':
    case 'delivered':
      return 'success';
    case 'delivery-failed':
      return 'destructive';
    case 'expired':
    case 'revoked':
      return 'warning';
    case 'pending':
      return 'secondary';
    default:
      return 'default';
  }
}

function canRetryInvitation(invitation: IMemberInvitation): boolean {
  return invitation.status !== 'accepted' && invitation.status !== 'revoked';
}

function MembersListContent() {
  const notificationsService = NotificationsService.getInstance();
  const { organizationId, settings } = useBrand();
  const userRole = useUserRole();
  const { orgHref } = useOrgUrl();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const seatLimit = getSeatLimitForTier(settings?.subscriptionTier);
  const upgradeTier = getUpgradeTierForLimit(
    'seats',
    settings?.subscriptionTier,
  );
  const isTeamSubscriptionLocked = seatLimit === 1 && upgradeTier !== null;
  const canManageInvitations =
    userRole === MemberRole.OWNER || userRole === MemberRole.ADMIN;

  const getMembersService = useAuthedService(
    useCallback((token: string) => MembersService.getInstance(token), []),
  );

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<IMemberInvitation[] | null>(
    null,
  );
  const [updatingInvitationIds, setUpdatingInvitationIds] = useState<
    Set<string>
  >(new Set());

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

  const invitationColumns: TableColumn<IMemberInvitation>[] = [
    {
      header: 'Email',
      key: 'email',
    },
    {
      header: 'Role',
      key: 'roleKey',
      render: (invitation) =>
        invitation.roleKey
          ? invitation.roleKey.charAt(0).toUpperCase() +
            invitation.roleKey.slice(1)
          : '-',
    },
    {
      header: 'Status',
      key: 'status',
      render: (invitation) => (
        <Badge variant={invitationStatusVariant(invitation.status)}>
          {formatInvitationStatus(invitation.status)}
        </Badge>
      ),
    },
    {
      header: 'Expires',
      key: 'expiresAt',
      render: (invitation) =>
        invitation.expiresAt ? formatDate(invitation.expiresAt) : '-',
    },
  ];

  const findAllMembers = useCallback(async () => {
    if (!organizationId || isTeamSubscriptionLocked) {
      setMembers([]);
      setInvitations([]);
      return;
    }

    setMembers(null);
    if (canManageInvitations) {
      setInvitations(null);
    }

    try {
      const service = await getMembersService();
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        organization: organizationId,
        page: currentPage,
      };

      const [memberData, invitationData] = await Promise.all([
        service.findAll(query),
        canManageInvitations ? service.listInvitations() : Promise.resolve([]),
      ]);
      setMembers(memberData);
      setInvitations(invitationData);
      logger.info('GET /members success', { count: memberData.length });
    } catch (error) {
      logger.error('GET /members failed', error);
      notificationsService.error('Failed to load members');
      setMembers([]);
      setInvitations([]);
    }
  }, [
    canManageInvitations,
    currentPage,
    getMembersService,
    isTeamSubscriptionLocked,
    notificationsService,
    organizationId,
  ]);

  const updateInvitation = useCallback(
    async (invitation: IMemberInvitation, action: 'resend' | 'revoke') => {
      const invitationId = invitation.id;
      if (!invitationId) {
        return;
      }

      setUpdatingInvitationIds((current) => new Set(current).add(invitationId));

      try {
        const service = await getMembersService();
        if (action === 'resend') {
          await service.resendInvitation(invitationId);
          notificationsService.success('Invitation delivery retried');
        } else {
          await service.revokeInvitation(invitationId);
          notificationsService.success('Invitation revoked');
        }
        await findAllMembers();
      } catch (error) {
        logger.error(`Invitation ${action} failed`, error);
        notificationsService.error(
          action === 'resend'
            ? 'Failed to retry invitation delivery'
            : 'Failed to revoke invitation',
        );
      } finally {
        setUpdatingInvitationIds((current) => {
          const next = new Set(current);
          next.delete(invitationId);
          return next;
        });
      }
    },
    [findAllMembers, getMembersService, notificationsService],
  );

  const invitationActions = [
    {
      icon: <RotateCw />,
      isDisabled: (invitation: IMemberInvitation) =>
        !invitation.id || updatingInvitationIds.has(invitation.id),
      isVisible: canRetryInvitation,
      onClick: (invitation: IMemberInvitation) =>
        void updateInvitation(invitation, 'resend'),
      tooltip: (invitation: IMemberInvitation) =>
        invitation.status === 'delivery-failed'
          ? 'Retry delivery'
          : 'Resend invitation',
    },
    {
      icon: <Ban />,
      isDisabled: (invitation: IMemberInvitation) =>
        !invitation.id || updatingInvitationIds.has(invitation.id),
      isVisible: canRetryInvitation,
      onClick: (invitation: IMemberInvitation) =>
        void updateInvitation(invitation, 'revoke'),
      tooltip: 'Revoke invitation',
    },
  ];

  useEffect(() => {
    findAllMembers();
  }, [findAllMembers]);

  const upgradeTierLabel = formatTierLabel(upgradeTier);

  return (
    <div className="space-y-4">
      {!isTeamSubscriptionLocked && canManageInvitations ? (
        <div className="flex justify-end">
          <Button
            onClick={() => openModal(ModalEnum.MEMBER)}
            icon={<UserPlus className="size-4" />}
            label="Invite Member"
          />
        </div>
      ) : null}

      {isTeamSubscriptionLocked ? (
        <CardEmpty
          actions={
            <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                Upgrade to {upgradeTierLabel}
              </Link>
            </Button>
          }
          description={`Your current plan is a solo workspace. Upgrade to ${upgradeTierLabel} to invite members and collaborate with your team.`}
          icon={Lock}
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

          {canManageInvitations ? (
            <AppTable<IMemberInvitation>
              items={invitations ?? []}
              columns={invitationColumns}
              actions={invitationActions}
              isLoading={invitations === null}
              getRowKey={(item, index) => item.id ?? `invitation-${index}`}
              label="Invitations"
              description="Track delivery, acceptance, expiry, and recovery for organization invitations."
              emptyLabel="No invitations"
            />
          ) : null}

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
