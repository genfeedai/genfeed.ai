'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, MemberRole, ModalEnum } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  EMPTY_PAGE_TOTALS,
  EMPTY_STATES,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  IMemberInvitation,
  IPagedItems,
  IQueryParams,
  IRole,
} from '@genfeedai/contracts/interfaces';
import {
  formatTierLabel,
  getSeatLimitForTier,
  getUpgradeTierForLimit,
} from '@genfeedai/pricing';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { updateCachedQueries } from '@hooks/auth/update-cached-queries/update-cached-queries';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isViewerQueryKey,
  useAuthedQuery,
} from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { useRefreshScope } from '@hooks/auth/use-refresh-scope/use-refresh-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Member } from '@models/organization/member.model';
import { Member as MemberModel } from '@models/organization/member.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MembersService } from '@services/organization/members.service';
import { useQueryClient } from '@tanstack/react-query';
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
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { LazyModalMember } from '@/components/lazy/modal/LazyModal';
import type { MemberBrandAccessProps } from '@/features/settings/props/members-list.props';
import { useUserRole } from '@/hooks/auth/use-user-role/use-user-role';
import { useOrganizationRoles } from '@/hooks/data/organization/use-organization-roles/use-organization-roles';
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

const EMPTY_MEMBERS: Member[] = [];
const EMPTY_INVITATIONS: IMemberInvitation[] = [];
const EMPTY_ROLES: IRole[] = [];

function organizationMembersQueryKey(organizationId: string | undefined) {
  return ['organization-members', organizationId ?? null] as const;
}

function memberInvitationsQueryKey(organizationId: string | undefined) {
  return ['organization-member-invitations', organizationId ?? null] as const;
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

  const translate = useTranslations('common.settings.members');
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const queryClient = useQueryClient();
  const { orgId, userId } = useAuthIdentity();

  // Roles are read once a member is opened for editing; the invite dialog
  // shares the same cached list.
  const [isRolesRequested, setIsRolesRequested] = useState(false);
  const rolesQuery = useOrganizationRoles(isRolesRequested);
  const roles = rolesQuery.data ?? EMPTY_ROLES;
  const isLoadingRoles = isRolesRequested && rolesQuery.isPending;
  const rolesError =
    rolesQuery.error && !rolesQuery.data
      ? translate('inlineEdit.loadRolesFailed')
      : null;
  function loadRoles() {
    if (isRolesRequested) {
      void rolesQuery.refetch();
      return;
    }
    setIsRolesRequested(true);
  }

  // Members and invitations read through React Query, so coming back to the
  // page paints the cached rows at once and refreshes them in the background;
  // another page, search or sort keeps the current rows while it loads.
  const isMembersEnabled = Boolean(organizationId) && !isTeamSubscriptionLocked;
  const membersScopeKey = organizationMembersQueryKey(organizationId);
  const membersQuery = usePagedAuthedQuery<MembersService, Member>({
    enabled: isMembersEnabled,
    keepPreviousDataWithin: membersScopeKey,
    queryFn: (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        organization: organizationId,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
      };
      return service.findAllPage(query, signal);
    },
    queryKey: [
      ...membersScopeKey,
      { page: currentPage, search, sort: sort ?? null },
    ],
    service: (token: string) => MembersService.getInstance(token),
  });
  const membersPage = isMembersEnabled ? membersQuery.data : undefined;
  const members = membersPage?.items ?? EMPTY_MEMBERS;
  const isLoadingMembers = isMembersEnabled && membersQuery.isPending;

  const isInvitationsEnabled = isMembersEnabled && canManageInvitations;
  const invitationsQuery = useAuthedQuery<MembersService, IMemberInvitation[]>({
    enabled: isInvitationsEnabled,
    queryFn: (service) => service.listInvitations(),
    queryKey: memberInvitationsQueryKey(organizationId),
    service: (token: string) => MembersService.getInstance(token),
  });
  const invitations = isInvitationsEnabled
    ? (invitationsQuery.data ??
      (invitationsQuery.error ? EMPTY_INVITATIONS : null))
    : EMPTY_INVITATIONS;

  const membersError = membersQuery.error ?? invitationsQuery.error;
  useEffect(() => {
    if (!membersError) {
      return;
    }
    logger.error('GET /members failed', membersError);
    NotificationsService.getInstance().error('Failed to load members');
  }, [membersError]);

  // Cancels reads that started before an invite or edit, so the re-read
  // always reflects it, across every cached page, search and sort.
  const refreshMemberRows = useRefreshScope(membersScopeKey);
  const refreshInvitations = useRefreshScope(
    memberInvitationsQueryKey(organizationId),
  );
  const refreshMembers = useCallback(
    () => Promise.all([refreshMemberRows(), refreshInvitations()]),
    [refreshInvitations, refreshMemberRows],
  );

  const [updatingInvitationIds, setUpdatingInvitationIds] = useState<
    Set<string>
  >(new Set());

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
        onLoadRoles={loadRoles}
        onUpdated={async (updated) => {
          // Only this viewer's cache: another account may have signed in.
          await updateCachedQueries<IPagedItems<Member>>(
            queryClient,
            {
              predicate: (query) =>
                isViewerQueryKey(query.queryKey, userId, orgId),
              queryKey: membersScopeKey,
            },
            (current) => ({
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? new MemberModel({ ...item, ...updated })
                  : item,
              ),
            }),
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
        await refreshMembers();
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
    [getMembersService, notificationsService, refreshMembers],
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
            items={members}
            columns={columns}
            actions={[]}
            isLoading={isLoadingMembers}
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
            <AutoPagination
              showTotal
              totalLabel="members"
              totals={membersPage?.totals ?? EMPTY_PAGE_TOTALS}
            />
          </div>

          <LazyModalMember
            organizationId={organizationId ?? ''}
            onConfirm={() => {
              void refreshMembers();
            }}
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
