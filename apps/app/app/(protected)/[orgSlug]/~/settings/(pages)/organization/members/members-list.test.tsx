import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MembersList from './members-list';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  getTotalDocs: vi.fn(),
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
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token-1'),
}));

// Org-wide total is exposed via PagesService (written by BaseService.findAll).
// getTotalDocs is the value the seat-limit check must read — not the page length.
vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    getCurrentPage: () => 1,
    getTotalDocs: () => mocks.getTotalDocs(),
    getTotalPages: () => 1,
    setCurrentPage: vi.fn(),
    setTotalDocs: vi.fn(),
    setTotalPages: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError, info: mocks.loggerInfo },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: mocks.notificationsError }),
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
  orgTotal: number;
  page?: string | null;
  pageCount: number;
  tier: string | null;
}

function renderMembers({
  orgTotal,
  page = null,
  pageCount,
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
  mocks.getTotalDocs.mockReturnValue(orgTotal);

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
    mocks.getTotalDocs.mockReturnValue(0);
    mocks.findAll.mockResolvedValue([]);
  });

  it('disables invite and shows upgrade copy when the org is at its seat limit', async () => {
    // Free tier caps at 1 seat; org already has 1 member on this page.
    renderMembers({ orgTotal: 1, pageCount: 1, tier: 'free' });

    await waitFor(() => {
      expect(inviteButton()).toBeDisabled();
    });
    expect(
      screen.getByText(/Upgrade to Pro to invite more people/i),
    ).toBeVisible();
  });

  it('enables invite and hides upgrade copy when the org is under its seat limit', async () => {
    // Free tier, but no members yet — one seat still available.
    renderMembers({ orgTotal: 0, pageCount: 0, tier: 'free' });

    await screen.findByText('No members found');
    expect(inviteButton()).toBeEnabled();
    expect(screen.queryByText(/Upgrade to/i)).not.toBeInTheDocument();
  });

  it('stays at the seat limit on an out-of-range page that returns no rows', async () => {
    // Regression: page 2 returns an empty slice, but the org-wide total (1)
    // already meets the free-tier cap. Must not re-enable invite from the empty
    // page length.
    renderMembers({ orgTotal: 1, page: '2', pageCount: 0, tier: 'free' });

    await waitFor(() => {
      expect(inviteButton()).toBeDisabled();
    });
    expect(
      screen.getByText(/Upgrade to Pro to invite more people/i),
    ).toBeVisible();
  });

  it('never blocks invite for an unlimited tier regardless of member count', async () => {
    // Pro tier has unlimited seats; a full page and a large total stay enabled.
    renderMembers({ orgTotal: 100, pageCount: 15, tier: 'pro' });

    await screen.findByText('15 members');
    expect(inviteButton()).toBeEnabled();
    expect(screen.queryByText(/Upgrade to/i)).not.toBeInTheDocument();
  });
});
