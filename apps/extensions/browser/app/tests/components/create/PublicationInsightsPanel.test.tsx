import { AnalyticsMetricAvailability } from '@genfeedai/contracts/enums/analytics-metric-availability.enum';
import { TargetAnalyticsCollectionState } from '@genfeedai/contracts/enums/scheduler.enum';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces/extension/extension-workspace.interface';
import { deserializeResource } from '@genfeedai/helpers/data/json-api/json-api.helper';

const snapshot: ExtensionWorkspaceSnapshot = {
  userId: 'user-1',
  organizationId: 'org-1',
  organizationLabel: 'Org',
  brandId: 'brand-1',
  revision: 1,
  isApiKey: false,
  brands: [],
  organizations: [],
};
function insight(patch: Partial<PublicationInsight> = {}): PublicationInsight {
  return {
    id: 'post-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    source: 'extension',
    platform: 'twitter',
    description: 'Original reply',
    publicationDate: '2026-10-01T00:00:00.000Z',
    isCapturedObservation: true,
    publicationKind: 'reply',
    externalId: '123',
    url: 'https://x.com/author/status/123',
    contextUrl: null,
    urlKind: 'permalink',
    urlIdentity: { kind: 'platform-publication-id', value: '123' },
    observedVisibility: 'unknown',
    credentialId: null,
    analyticsAvailability: 'eligible',
    collectionState: TargetAnalyticsCollectionState.READY,
    collectionMessage: null,
    latestSample: {
      date: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      metrics: {
        views: { value: 0, availability: AnalyticsMetricAvailability.OBSERVED },
        likes: {
          value: null,
          availability: AnalyticsMetricAvailability.UNAVAILABLE,
        },
        comments: {
          value: null,
          availability: AnalyticsMetricAvailability.UNAUTHORIZED,
        },
        shares: {
          value: null,
          availability: AnalyticsMetricAvailability.EXPIRED,
        },
        saves: {
          value: null,
          availability: AnalyticsMetricAvailability.FAILED,
        },
      },
    },
    linkCandidates: [{ id: 'account-1', label: 'Original account' }],
    ...patch,
  };
}

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationInsightsPanel } from '~components/create/PublicationInsightsPanel';
import { usePublicationInsights } from '~hooks/use-publication-insights';

vi.mock('~hooks/use-publication-insights', () => ({
  usePublicationInsights: vi.fn(),
}));
vi.mock('~services/environment.service', () => ({
  appDomain: 'https://app.genfeed.ai',
}));
vi.mock('@ui/primitives/select', () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: ComponentProps<typeof import('@ui/primitives/select').Select>) => (
    <select
      aria-label="Selection"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      <option value="">Choose</option>
      {children}
    </select>
  ),
  SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: ComponentProps<typeof import('@ui/primitives/select').SelectItem>) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
const handlers = {
  select: vi.fn(),
  selectPage: vi.fn(),
  retry: vi.fn(),
  reload: vi.fn(),
  refresh: vi.fn(),
  link: vi.fn(),
};
function state(patch: Partial<ReturnType<typeof usePublicationInsights>> = {}) {
  return {
    key: 'key',
    page: 1,
    pageData: { items: [insight()], page: 1, limit: 10, pages: 1, total: 1 },
    selectedPostId: 'post-1',
    insight: insight(),
    isLoading: false,
    isBusy: false,
    error: null,
    notice: null,
    snapshot,
    lookup: {
      platform: 'twitter',
      pageUrl: 'https://x.com/a/status/123',
    } as const,
    ...handlers,
    ...patch,
  };
}
function show(patch: Partial<ReturnType<typeof usePublicationInsights>> = {}) {
  vi.mocked(usePublicationInsights).mockReturnValue(state(patch));
  return render(<PublicationInsightsPanel />);
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe('publication detail and explicit recovery', () => {
  it('shows saved zero, timestamps, original source, unknown audience and safe permalink', () => {
    show();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Audience unavailable')).toBeInTheDocument();
    expect(screen.getByText(/twitter · Extension/)).toBeInTheDocument();
    expect(screen.getByText(/Sample date:/)).toHaveTextContent(
      new Date('2026-10-01T00:00:00.000Z').toLocaleString(),
    );
    expect(screen.getByRole('link', { name: 'Open post' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
  });
  it.each(['manual', 'agent'])(
    'keeps the original %s source and private audience',
    (source) => {
      show({
        insight: insight({
          source,
          observedVisibility: 'private',
          url: null,
          contextUrl: 'https://x.com/a/status/parent',
          urlKind: 'context-only',
        }),
      });
      expect(screen.getByText(`twitter · ${source}`)).toBeInTheDocument();
      expect(screen.getByText('Private')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Open parent post' }),
      ).toHaveAttribute('href', 'https://x.com/a/status/parent');
      expect(screen.queryByText('Already in Genfeed')).toBeNull();
    },
  );
  it('does not invent sample metrics and retains unavailable reason', () => {
    show({
      insight: insight({
        latestSample: null,
        analyticsAvailability: 'missing-external-id',
        source: null,
        collectionMessage: 'Original identity is missing.',
      }),
    });
    expect(screen.getByText('Analytics unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
    expect(
      screen.getByText('Original identity is missing.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh analytics' }),
    ).toBeDisabled();
    expect(
      screen.getByText('twitter · Source unavailable'),
    ).toBeInTheDocument();
  });
  it('shows awaiting analytics and never a live sample badge', () => {
    show({
      insight: insight({
        latestSample: null,
        collectionState: TargetAnalyticsCollectionState.PENDING,
      }),
    });
    expect(screen.getByText('Awaiting analytics')).toBeInTheDocument();
    expect(screen.queryByText(/Last saved:/)).toBeNull();
  });
  it('requires explicit account choice even for one candidate and keeps link separate from refresh', () => {
    show();
    const link = screen.getByRole('button', { name: 'Link account' });
    expect(link).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveValue('');
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'account-1' },
    });
    fireEvent.click(link);
    expect(handlers.link).toHaveBeenCalledWith('account-1');
    expect(handlers.refresh).not.toHaveBeenCalled();
  });
  it('does not offer a Link write for a nonnull credential ID', () => {
    show({ insight: insight({ credentialId: '' }) });
    expect(screen.queryByRole('button', { name: 'Link account' })).toBeNull();
  });
  it('clears account choice when server candidates change and shows safe conflict', () => {
    const view = show();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'account-1' },
    });
    vi.mocked(usePublicationInsights).mockReturnValue(
      state({
        insight: insight({
          linkCandidates: [{ id: 'account-2', label: 'Other match' }],
        }),
        error:
          'Could not link this account. Reload this publication and choose a matching account.',
      }),
    );
    view.rerender(<PublicationInsightsPanel />);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Link account' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not link this account.',
    );
  });
  it('offers fallback account recovery without guessing IDs as slugs, even with no candidates', () => {
    show({
      insight: insight({
        latestSample: null,
        analyticsAvailability: 'missing-credential',
        linkCandidates: [],
      }),
    });
    expect(
      screen.getByRole('link', {
        name: 'Open Genfeed to connect the original account',
      }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai');
    expect(screen.queryByRole('button', { name: 'Link account' })).toBeNull();
  });
  it('builds recovery from verified encoded slugs and reconnects expired access', () => {
    const brand = deserializeResource<IBrand>({
      data: {
        id: 'brand-1',
        type: 'brand',
        attributes: { slug: 'brand space' },
      },
    });
    show({
      snapshot: {
        ...snapshot,
        brands: [brand],
        organizations: [
          {
            id: 'org-1',
            slug: 'org space',
            label: 'Org',
            brand: null,
            isActive: true,
            isOwner: true,
          },
        ],
      },
      insight: insight({ credentialId: 'original' }),
    });
    expect(
      screen.getByRole('link', { name: 'Reconnect account' }),
    ).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/org%20space/brand%20space/settings/connected-accounts',
    );
  });
  it('offers reload as read and disables all actions during an operation', () => {
    const view = show();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload saved metrics' }),
    );
    expect(handlers.reload).toHaveBeenCalledTimes(1);
    expect(handlers.refresh).not.toHaveBeenCalled();
    vi.mocked(usePublicationInsights).mockReturnValue(
      state({ isBusy: true, notice: 'Account linked' }),
    );
    view.rerender(<PublicationInsightsPanel />);
    expect(
      screen.getByRole('button', { name: 'Refresh analytics' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reload saved metrics' }),
    ).toBeDisabled();
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Account linked');
  });
  it('renders explicit distinct post/reply options and pagination', () => {
    show({
      insight: null,
      selectedPostId: null,
      pageData: {
        items: [
          insight({
            id: 'parent',
            publicationKind: 'post',
            description: 'Parent',
          }),
          insight({ id: 'reply', description: 'Reply text' }),
        ],
        page: 1,
        limit: 10,
        pages: 2,
        total: 11,
      },
    });
    expect(
      screen.getByRole('option', { name: /Post · Parent/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: /Reply · Reply text/ }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'reply' },
    });
    expect(handlers.select).toHaveBeenCalledWith('reply');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(handlers.selectPage).toHaveBeenCalledWith(2);
  });
  it('shows neutral/loading/empty/error states with accessible recovery', () => {
    const view = show({ snapshot: null, insight: null, lookup: null });
    expect(
      screen.getByText('Open a published post to view its analytics.'),
    ).toBeInTheDocument();
    vi.mocked(usePublicationInsights).mockReturnValue(
      state({ insight: null, isLoading: true }),
    );
    view.rerender(<PublicationInsightsPanel />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading publication analytics',
    );
    vi.mocked(usePublicationInsights).mockReturnValue(
      state({
        insight: null,
        pageData: { items: [], page: 1, limit: 10, pages: 0, total: 0 },
        error: 'Could not load this publication. Retry.',
      }),
    );
    view.rerender(<PublicationInsightsPanel />);
    expect(
      screen.getByText('No recorded publication was found for this page'),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(handlers.retry).toHaveBeenCalledTimes(1);
  });
});

describe('explicit recovery after the server shrinks publication pages', () => {
  it.each([
    [2, 1, 1, 1],
    [3, 1, 1, 1],
    [5, 1, 1, 1],
    [2, 0, 0, 1],
    [3, 0, 0, 1],
    [5, 0, 0, 1],
    [5, 11, 2, 2],
    [3, 41, 5, 2],
  ])(
    'page%s total%s pages%s recovers to%s only on Previous',
    (page, total, pages, target) => {
      const view = show({
        page,
        selectedPostId: null,
        insight: null,
        pageData: { items: [], page, total, pages, limit: 10 },
      });
      for (const handler of Object.values(handlers))
        expect(handler).not.toHaveBeenCalled();
      const previous = screen.getByRole('button', { name: 'Previous' });
      expect(previous).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty(
        'disabled',
        page >= pages,
      );
      expect(
        screen.getByText(`Page ${page} / ${pages} · ${total} publications`),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('option', { name: /Post ·|Reply ·/ }),
      ).toBeNull();
      expect(screen.queryByText('0')).toBeNull();
      expect(screen.queryByText(/Sample date:/)).toBeNull();
      fireEvent.click(previous);
      expect(handlers.selectPage).toHaveBeenCalledExactlyOnceWith(target);
      for (const [name, handler] of Object.entries(handlers))
        if (name !== 'selectPage') expect(handler).not.toHaveBeenCalled();
      const returned =
        total === 1
          ? state({
              page: 1,
              insight: insight(),
              pageData: {
                items: [insight()],
                page: 1,
                total: 1,
                pages: 1,
                limit: 10,
              },
            })
          : state({
              page: 1,
              selectedPostId: null,
              insight: null,
              pageData: { items: [], page: 1, total: 0, pages: 0, limit: 10 },
            });
      vi.mocked(usePublicationInsights).mockReturnValue(returned);
      view.rerender(<PublicationInsightsPanel />);
      expect(screen.queryByRole('button', { name: 'Previous' })).toBeNull();
      if (total === 1)
        expect(screen.getByText('Original reply')).toBeInTheDocument();
      else
        expect(
          screen.getByText('No recorded publication was found for this page'),
        ).toBeInTheDocument();
      expect(handlers.selectPage).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['isBusy', 'isLoading'] as const)(
    'disables recovery during%s',
    (field) => {
      show({
        page: 5,
        [field]: true,
        insight: null,
        selectedPostId: null,
        pageData: { items: [], page: 5, total: 0, pages: 0, limit: 10 },
      });
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
      expect(handlers.selectPage).not.toHaveBeenCalled();
    },
  );
});
