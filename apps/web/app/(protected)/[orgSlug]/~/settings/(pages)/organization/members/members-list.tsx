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
  IRole,
} from '@genfeedai/contracts/interfaces';
import {
  formatTierLabel,
  getSeatLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Member } from '@models/organization/member.model';
import { Member as MemberModel } from '@models/organization/member.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MembersService } from '@services/organization/members.service';
import { RolesService } from '@services/organization/roles.service';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Ban, Lock, RotateCw, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { LazyModalMember } from '@/components/lazy/modal/LazyModal';
import type { MemberBrandAccessProps } from '@/features/settings/props/members-list.props';
import { useUserRole } from '@/hooks/auth/use-user-role/use-user-role';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import MemberDetails from './member-details';

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

const MEMBER_SORT_KEYS = [
  'userFullName',
  'roleLabel',
  'isActive',
  'createdAt',
] as const;

function MembersListContent() {
  const notificationsService = NotificationsService.getInstance();
  const { organizationId, settings, brands } = useBrand();
  const userRole = useUserRole();
  const { orgHref } = useOrgUrl();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { search, setSearch } = useAdminSearchParam();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: MEMBER_SORT_KEYS,
  });
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

  const [roles, setRoles] = useState<IRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const rolesRequest = useRef<AbortController | null>(null);
  const getRolesService = useAuthedService((token: string) =>
    RolesService.getInstance(token),
  );
  useEffect(() => () => rolesRequest.current?.abort(), []);
  async function loadRoles() {
    rolesRequest.current?.abort();
    const abort = new AbortController();
    rolesRequest.current = abort;
    setIsLoadingRoles(true);
    setRolesError(null);
    try {
      const service = await getRolesService();
      const data = await service.findAll({}, abort.signal);
      if (!abort.signal.aborted) setRoles(data);
    } catch {
      if (!abort.signal.aborted)
        setRolesError(translate('inlineEdit.loadRolesFailed'));
    } finally {
      if (!abort.signal.aborted) setIsLoadingRoles(false);
    }
  }

  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitations, setInvitations] = useState<IMemberInvitation[] | null>(
    null,
  );
  const [updatingInvitationIds, setUpdatingInvitationIds] = useState<
    Set<string>
  >(new Set());

  const translate = useTranslations('common.settings.members');
  const rowSidebarT = useTranslations('ui.rowSidebar');

  const columns: TableColumn<Member>[] = [
    {
      header: translate('columnMember'),
      key: 'userFullName',
      sortable: true,
      render: (member: Member) => {
        const name = member.userFullName;
        const hasName = Boolean(name) && name !== '-';
        const displayName = hasName ? name : member.userEmail || 'Unknown';
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar
              alt={displayName}
              name={displayName}
              size="md"
              src={member.user?.avatar}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">{displayName}</p>
              {hasName && member.userEmail ? (
                <p className="truncate text-xs text-muted-foreground">
                  {member.userEmail}
                </p>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Role',
      key: 'roleLabel',
      sortable: true,
      render: (member: Member) => member.roleLabel || '-',
    },
    {
      header: translate('columnBrands'),
      key: 'brands',
      render: (member: Member) => <MemberBrandAccess member={member} />,
    },
    {
      header: translate('inlineEdit.status'),
      key: 'isActive',
      sortable: true,
      render: (member: Member) =>
        member.isActive
          ? translate('inlineEdit.active')
          : translate('inlineEdit.inactive'),
    },
    {
      header: 'Joined',
      key: 'createdAt',
      sortable: true,
      render: (member: Member) => <TableDateCell value={member.createdAt} />,
    },
  ];

  const memberSidebar = {
    getId: (member: Member) => member.id,
    getSubtitle: (member: Member) => member.userEmail || undefined,
    getTitle: (member: Member) =>
      member.userFullName && member.userFullName !== '-'
        ? member.userFullName
        : member.userEmail || rowSidebarT('unknown'),
    kind: 'user' as const,
    render: (member: Member) => (
      <MemberDetails
        key={member.id}
        member={member}
        organizationId={organizationId ?? ''}
        actorRole={userRole}
        brands={brands ?? []}
        roles={roles}
        isLoadingRoles={isLoadingRoles}
        rolesError={rolesError}
        onLoadRoles={() => {
          void loadRoles();
        }}
        onUpdated={(updated) => {
          setMembers(
            (current) =>
              current?.map((item) =>
                item.id === updated.id
                  ? new MemberModel({ ...item, ...updated })
                  : item,
              ) ?? null,
          );
        }}
      />
    ),
  };

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
      render: (invitation) => (
        <TableDateCell hasTime={false} value={invitation.expiresAt} />
      ),
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
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
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
    search,
    sort,
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

  const upgradeTierLabel = formatTierLabel(upgradeTier, 'a paid plan');

  return (
    <Container
      label={translate('inlineEdit.membersTitle')}
      titleVisibility="sr-only"
      moduleChrome
      bodyClassName="space-y-4"
      leading={
        isTeamSubscriptionLocked ? undefined : (
          <SearchField
            ariaLabel={translate('search')}
            onSearch={setSearch}
            placeholder={translate('search')}
            value={search}
          />
        )
      }
      right={
        !isTeamSubscriptionLocked && canManageInvitations ? (
          <Button
            onClick={() => openModal(ModalEnum.MEMBER)}
            icon={<UserPlus className="size-4" />}
            label={translate('inlineEdit.inviteMember')}
          />
        ) : undefined
      }
    >
      {isTeamSubscriptionLocked ? (
        <EmptyState
          surface="card"
          actions={
            <Button asChild variant={ButtonVariant.DEFAULT} withWrapper={false}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                Upgrade to {upgradeTierLabel}
              </Link>
            </Button>
          }
          icon={Lock}
          title={`Unlock team members with ${upgradeTierLabel}`}
        />
      ) : (
        <>
          <AppTable<Member>
            items={members ?? []}
            columns={columns}
            actions={[]}
            isLoading={members === null}
            getRowKey={(item) => item.id}
            rowSidebar={memberSidebar}
            emptyLabel={EMPTY_STATES.MEMBERS_FOUND}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
          />

          {canManageInvitations ? (
            <AppTable<IMemberInvitation>
              items={invitations ?? []}
              columns={invitationColumns}
              actions={invitationActions}
              isLoading={invitations === null}
              getRowKey={(item, index) => item.id ?? `invitation-${index}`}
              label="Invitations"
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
    </Container>
  );
}

export default function MembersList() {
  return (
    <Suspense fallback={null}>
      <MembersListContent />
    </Suspense>
  );
}

/**
 * Owners and admins bypass brand assignments, and an empty assignment list
 * means unrestricted — both read as "All brands" (matches server access checks).
 */
function MemberBrandAccess({ member }: MemberBrandAccessProps) {
  const translate = useTranslations('common.settings.members');
  const roleKey = member.role?.key ?? member.roleKey;
  const brands = member.brands ?? [];
  const isUnrestricted =
    roleKey === MemberRole.OWNER ||
    roleKey === MemberRole.ADMIN ||
    brands.length === 0;

  if (isUnrestricted) {
    return (
      <span className="text-sm text-muted-foreground">
        {translate('allBrands')}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {brands.slice(0, 3).map((brand) => (
        <Badge key={brand.id} variant="secondary">
          {brand.label}
        </Badge>
      ))}
      {brands.length > 3 ? (
        <Badge variant="outline">+{brands.length - 3}</Badge>
      ) : null}
    </div>
  );
}
