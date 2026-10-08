import type {
  SocialTimelineResponse,
  SourcePostNativeActionInput,
  SourcePostNativeActionResult,
} from '@genfeedai/contracts/interfaces';
import type { CollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectedTimelines from './connected-timelines';

const mocks = vi.hoisted(() => ({
  scope: {
    organizationId: 'org-a',
    brandId: 'brand-a',
    isReady: true,
    pageScope: 'brand',
  } as CollectionScope,
  service: {
    read: vi.fn<(brandId: string) => Promise<SocialTimelineResponse>>(),
    refresh:
      vi.fn<
        (
          brandId: string,
          credentialId?: string,
        ) => Promise<SocialTimelineResponse>
      >(),
    act: vi.fn<
      (
        brandId: string,
        postId: string,
        input: SourcePostNativeActionInput,
      ) => Promise<SourcePostNativeActionResult>
    >(),
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => mocks.service,
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => mocks.scope,
  isBrandResourceReady: (scope: CollectionScope) =>
    scope.isReady && Boolean(scope.organizationId && scope.brandId),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@genfeedai/contexts/ui/sidebar-navigation-context', () => ({
  useSidebarNavigation: () => ({ hasCanonicalBreadcrumb: true }),
}));
vi.mock('@genfeedai/contexts/ui/page-help-context', () => ({
  usePageHelp: () => null,
}));
vi.mock('@ui/layout/section-topbar/SectionTopbar', () => ({
  default: () => null,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const timeline: SocialTimelineResponse = {
  accounts: [
    {
      credentialId: 'credential-a',
      platform: 'twitter',
      label: 'Selected account',
      kind: 'home',
      status: 'ready',
      actions: ['like', 'reply'],
      posts: [
        {
          id: 'post-a',
          organizationId: 'org-a',
          brandId: 'brand-a',
          sourceId: 'source-a',
          externalId: 'tweet-a',
          platform: 'twitter',
          contentType: 'post',
          authorDisplayName: 'Followed author',
          text: 'A post from the curated home feed',
          sourceUrl: 'https://x.com/author/status/123',
          isDeleted: false,
          createdAt: '2026-10-08T12:00:00Z',
          updatedAt: '2026-10-08T12:00:00Z',
        },
      ],
    },
  ],
};

function renderFollowing() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConnectedTimelines />
    </QueryClientProvider>,
  );
}

describe('connected Following feeds and native action confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.scope = {
      organizationId: 'org-a',
      brandId: 'brand-a',
      isReady: true,
      pageScope: 'brand',
    };
    mocks.service.read.mockResolvedValue(timeline);
    mocks.service.refresh.mockResolvedValue(timeline);
    mocks.service.act.mockResolvedValue({
      id: 'receipt-a',
      status: 'completed',
    });
  });

  it('loads connected accounts automatically, but refreshes only after an explicit click', async () => {
    renderFollowing();
    expect(await screen.findByText('Followed author')).toBeInTheDocument();
    expect(mocks.service.read).toHaveBeenCalledWith('brand-a');
    expect(mocks.service.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Refresh$/ }));
    await waitFor(() =>
      expect(mocks.service.refresh).toHaveBeenCalledWith(
        'brand-a',
        'credential-a',
      ),
    );
  });

  it('requires a brand instead of querying with an empty brand on organization routes', () => {
    mocks.scope.brandId = undefined;
    mocks.scope.pageScope = 'org';
    renderFollowing();
    expect(
      screen.getByText(/Select a brand in the header/),
    ).toBeInTheDocument();
    expect(mocks.service.read).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Refresh feeds' }),
    ).toBeDisabled();
  });

  it('keeps the original action key and selected account while checking uncertain delivery', async () => {
    mocks.service.act.mockResolvedValueOnce({
      id: 'receipt-a',
      status: 'uncertain',
      message: 'Check the source before sending again.',
    });
    renderFollowing();
    await screen.findByText('Followed author');
    fireEvent.click(screen.getByRole('button', { name: /^Like$/ }));
    await screen.findByRole('button', { name: 'Check action confirmation' });
    await waitFor(() => expect(mocks.service.act).toHaveBeenCalledTimes(1));
    const first = mocks.service.act.mock.calls[0];
    expect(first).toEqual([
      'brand-a',
      'post-a',
      expect.objectContaining({
        action: 'like',
        credentialId: 'credential-a',
        idempotencyKey: expect.any(String),
      }),
    ]);
    expect(screen.getByRole('button', { name: /^Like$/ })).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check action confirmation' }),
    );
    await screen.findByText('Like completed as Selected account.');
    expect(mocks.service.act.mock.calls[1]).toEqual(first);
    expect(
      screen.getByRole('button', { name: 'Like complete' }),
    ).toBeDisabled();
  });

  it('shows the posting account and requires explicit publication of composed text', async () => {
    renderFollowing();
    await screen.findByText('Followed author');
    fireEvent.click(screen.getByRole('button', { name: /^Reply$/ }));
    expect(screen.getByText('Reply as Selected account')).toBeInTheDocument();
    expect(mocks.service.act).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply text' }), {
      target: { value: 'An intentional reply' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish reply' }));
    await waitFor(() =>
      expect(mocks.service.act).toHaveBeenCalledWith(
        'brand-a',
        'post-a',
        expect.objectContaining({
          action: 'reply',
          credentialId: 'credential-a',
          text: 'An intentional reply',
        }),
      ),
    );
  });
});
