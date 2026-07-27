import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MembersList from './members-list';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  getMembersService: vi.fn(),
  getNotificationsService: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  notificationsError: vi.fn(),
  openModal: vi.fn(),
  replace: vi.fn(),
  useBrand: vi.fn(),
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
    emptyLabel,
    isLoading,
    items,
  }: {
    emptyLabel: string;
    isLoading?: boolean;
    items: Array<{ id: string }>;
  }) => {
    if (isLoading) {
      return <div>Loading members</div>;
    }

    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }

    return <div>{items.length} members</div>;
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
  page?: string | null;
  pageCount: number;
  tier: string | null;
}

function renderMembers({ page = null, pageCount, tier }: RenderOptions) {
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
    });
    mocks.getNotificationsService.mockReturnValue({
      error: mocks.notificationsError,
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
    ).toHaveAttribute('href', '/org-123/~/settings/billing');
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
});
