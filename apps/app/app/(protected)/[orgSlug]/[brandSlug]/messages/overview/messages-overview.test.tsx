import { PageScope, SocialConversationType } from '@genfeedai/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessagesOverview from './messages-overview';

const mocks = vi.hoisted(() => ({
  brandId: 'brand-1',
  listPage: vi.fn(),
  unreadCount: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: mocks.brandId, organizationId: 'org-1' }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    listPage: mocks.listPage,
    unreadCount: mocks.unreadCount,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/brand-x${path}` }),
}));

const OPEN_TOTALS: Record<string, number> = {
  [SocialConversationType.COMMENT]: 0,
  [SocialConversationType.DM]: 4,
  [SocialConversationType.REPLY]: 1,
};

function renderOverview(scope?: PageScope.BRAND | PageScope.ORGANIZATION) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MessagesOverview scope={scope} />
    </QueryClientProvider>,
  );
}

describe('MessagesOverview (#5502)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unreadCount.mockResolvedValue({ id: 'u', unreadCount: 7 });
    mocks.listPage.mockImplementation(
      async ({ conversationType }: { conversationType: string }) => ({
        total: OPEN_TOTALS[conversationType] ?? 0,
      }),
    );
  });

  it('counts open conversations per kind and links each to a filtered Inbox', async () => {
    renderOverview();

    expect(await screen.findByText('4 open conversations.')).toBeVisible();
    expect(screen.getByText('1 open conversation.')).toBeVisible();
    expect(screen.getByText('Nothing open.')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open DMs' })).toHaveAttribute(
      'href',
      '/acme/brand-x/messages?type=dm',
    );
    expect(screen.getByRole('link', { name: 'Open Replies' })).toHaveAttribute(
      'href',
      '/acme/brand-x/messages?type=reply',
    );
    expect(screen.getByRole('link', { name: 'Open Comments' })).toHaveAttribute(
      'href',
      '/acme/brand-x/messages?type=comment',
    );
    expect(screen.getByRole('link', { name: 'Open inbox' })).toHaveAttribute(
      'href',
      '/acme/brand-x/messages',
    );
    expect(mocks.listPage).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        conversationType: SocialConversationType.DM,
        limit: 1,
        status: 'open',
      }),
      expect.anything(),
    );
  });

  it('counts every brand at organization scope', async () => {
    renderOverview(PageScope.ORGANIZATION);

    await screen.findByText('4 open conversations.');
    expect(mocks.unreadCount).toHaveBeenCalledWith(
      { allBrands: true },
      expect.anything(),
    );
  });

  it('reports a failed count instead of showing zeros as fact', async () => {
    mocks.unreadCount.mockRejectedValue(new Error('boom'));

    renderOverview();

    expect(
      await screen.findByText('Message counts could not be loaded.'),
    ).toBeVisible();
  });
});
