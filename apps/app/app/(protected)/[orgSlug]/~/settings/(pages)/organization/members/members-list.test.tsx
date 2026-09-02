import '@testing-library/jest-dom/vitest';
import { MemberRole } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MembersList from './members-list';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  listInvitations: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  getMembersService: vi.fn(),
  getNotificationsService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  notificationsSuccess: vi.fn(),
  openModal: vi.fn(),
  replace: vi.fn(),
  useBrand: vi.fn(),
  useUserRole: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.useBrand(),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: mocks.openModal,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getMembersService,
}));

vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.useUserRole(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/org-123/~${path}`,
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError, info: mocks.loggerInfo },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: mocks.getNotificationsService,
  },
}));

vi.mock('@services/organization/members.service', () => ({
  MembersService: {
    getInstance: () => ({ findAll: mocks.findAll }),
  },
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    actions,
    columns,
    emptyLabel,
    isLoading,
    items,
    label,
  }: {
    actions: Array<{
      isVisible?: (item: Record<string, unknown>) => boolean;
      onClick?: (item: Record<string, unknown>) => void;
      tooltip: string | ((item: Record<string, unknown>) => string);
    }>;
    columns: Array<{
      key: string;
      render?: (item: Record<string, unknown>) => React.ReactNode;
    }>;
    emptyLabel: string;
    isLoading?: boolean;
    items: Array<Record<string, unknown>>;
    label?: string;
  }) => {
    if (isLoading) {
      return <div>{label ? `Loading ${label}` : 'Loading members'}</div>;
    }

    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }

    return (
      <div>
        {label ? <h3>{label}</h3> : null}
        <div>{items.length} members</div>
        {items.map((item, itemIndex) => (
          <div key={String(item.id ?? itemIndex)}>
            {columns.map((column) => (
              <div key={column.key}>
                {column.render
                  ? column.render(item)
                  : String(item[column.key] ?? '')}
              </div>
            ))}
            {actions
              .filter((action) => action.isVisible?.(item) ?? true)
              .map((action) => {
                const tooltip =
                  typeof action.tooltip === 'function'
                    ? action.tooltip(item)
                    : action.tooltip;
                return (
                  <button
                    key={tooltip}
                    type="button"
                    aria-label={tooltip}
                    onClick={() => action.onClick?.(item)}
                  >
                    {tooltip}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('@ui/lazy/modal/LazyModal', () => ({
  LazyModalMember: () => null,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: () => null,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/org-123/settings/organization/members',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.useSearchParams(),
}));

interface RenderOptions {
  invitations?: Array<Record<string, unknown>>;
  page?: string | null;
  pageCount: number;
  role?: MemberRole;
  tier: string | null;
}

function renderMembers({
  invitations = [],
  page = null,
  pageCount,
  role = MemberRole.OWNER,
  tier,
}: RenderOptions) {
  mocks.useBrand.mockReturnValue({
    organizationId: 'org-123',
    settings: { subscriptionTier: tier },
  });
  mocks.useSearchParams.mockReturnValue({
    get: (key: string) => (key === 'page' ? page : null),
    toString: () => (page ? `page=${page}` : ''),
  });

  const pageMembers = Array.from({ length: pageCount }, (_, index) => ({
    createdAt: '2026-01-01T00:00:00.000Z',
    id: `member-${index}`,
    roleLabel: 'Member',
    userEmail: `user-${index}@example.test`,
    userFullName: `User ${index}`,
  }));
  mocks.findAll.mockResolvedValue(pageMembers);
  mocks.listInvitations.mockResolvedValue(invitations);
  mocks.useUserRole.mockReturnValue(role);

  return render(<MembersList />);
}

function inviteButton(): HTMLElement {
  return screen.getByRole('button', { name: /Invite Member/i });
}

describe('MembersList seat limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockResolvedValue([]);
    mocks.getMembersService.mockResolvedValue({
      findAll: mocks.findAll,
      listInvitations: mocks.listInvitations,
      resendInvitation: mocks.resendInvitation,
      revokeInvitation: mocks.revokeInvitation,
    });
    mocks.getNotificationsService.mockReturnValue({
      error: mocks.notificationsError,
      success: mocks.notificationsSuccess,
    });
  });

  it('replaces the member table with an upgrade state for solo plans', async () => {
    renderMembers({ pageCount: 1, tier: 'free' });

    expect(screen.getByText('Unlock team members with Pro')).toBeVisible();
    expect(
      screen.getByText(/Your current plan is a solo workspace/i),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Upgrade to Pro' }),
    ).toHaveAttribute('href', '/org-123/~/settings/subscription');
    expect(
      screen.queryByRole('button', { name: /Invite Member/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('1 members')).not.toBeInTheDocument();
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it('applies the same solo-workspace gate to BYOK', () => {
    renderMembers({ pageCount: 0, tier: 'byok' });

    expect(
      screen.getByText('Unlock team members with Pro'),
    ).toBeInTheDocument();
    expect(mocks.findAll).not.toHaveBeenCalled();
  });

  it('loads the member table and enables invites for Pro', async () => {
    renderMembers({ pageCount: 0, tier: 'pro' });

    await screen.findByText('No members found');
    expect(inviteButton()).toBeEnabled();
    expect(screen.queryByText(/Unlock team members/i)).not.toBeInTheDocument();
    expect(mocks.findAll).toHaveBeenCalled();
  });

  it('never blocks invite for an unlimited tier regardless of member count', async () => {
    renderMembers({ pageCount: 15, tier: 'pro' });

    await screen.findByText('15 members');
    expect(inviteButton()).toBeEnabled();
    expect(screen.queryByText(/Upgrade to/i)).not.toBeInTheDocument();
  });

  it('shows invitation lifecycle states and recovery actions to owners', async () => {
    renderMembers({
      invitations: [
        {
          email: 'pending@example.com',
          expiresAt: '2026-09-01T00:00:00.000Z',
          id: 'inv_pending',
          roleKey: 'member',
          status: 'pending',
        },
        {
          email: 'accepted@example.com',
          id: 'inv_accepted',
          roleKey: 'admin',
          status: 'accepted',
        },
        {
          email: 'expired@example.com',
          id: 'inv_expired',
          roleKey: 'member',
          status: 'expired',
        },
        {
          email: 'failed@example.com',
          id: 'inv_failed',
          roleKey: 'member',
          status: 'delivery-failed',
        },
      ],
      pageCount: 0,
      tier: 'pro',
    });

    expect(
      await screen.findByRole('heading', { name: 'Invitations' }),
    ).toBeVisible();
    expect(screen.getByText('Pending')).toBeVisible();
    expect(screen.getByText('Accepted')).toBeVisible();
    expect(screen.getByText('Expired')).toBeVisible();
    expect(screen.getByText('Delivery Failed')).toBeVisible();
    expect(screen.getByText('Admin')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Resend invitation' }),
    ).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Retry delivery' }),
    ).toBeInTheDocument();
  });

  it('hides invitation management from non-admin members', async () => {
    renderMembers({
      pageCount: 0,
      role: MemberRole.USER,
      tier: 'pro',
    });

    await screen.findByText('No members found');
    expect(screen.queryByRole('button', { name: /Invite Member/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Invitations' })).toBeNull();
    expect(mocks.listInvitations).not.toHaveBeenCalled();
  });

  it('retries a failed delivery without creating a new UI row', async () => {
    mocks.resendInvitation.mockResolvedValue({
      id: 'inv_failed',
      status: 'delivered',
    });
    renderMembers({
      invitations: [
        {
          email: 'failed@example.com',
          id: 'inv_failed',
          roleKey: 'member',
          status: 'delivery-failed',
        },
      ],
      pageCount: 0,
      tier: 'pro',
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Retry delivery' }),
    );

    await waitFor(() => {
      expect(mocks.resendInvitation).toHaveBeenCalledWith('inv_failed');
    });
  });
});
