import { AnalyticsMetricAvailability } from '@genfeedai/contracts/enums/analytics-metric-availability.enum';
import { TargetAnalyticsCollectionState } from '@genfeedai/contracts/enums/scheduler.enum';
import type { PublicationInsight } from '@genfeedai/contracts/interfaces/content/publication-insights.interface';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces/extension/extension-workspace.interface';

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

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublicationInsights } from '~hooks/use-publication-insights';
import { PublicationInsightsRequestError } from '~services/publication-insights.service';
import { usePlatformStore } from '~store/use-platform-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  detail: vi.fn(),
  refresh: vi.fn(),
  link: vi.fn(),
}));
vi.mock('~services/publication-insights.service', async (original) => ({
  ...(await original()),
  loadPublicationInsightPage: mocks.page,
  loadPublicationInsight: mocks.detail,
  refreshPublicationInsight: mocks.refresh,
  linkPublicationInsightCredential: mocks.link,
}));
vi.mock('~services/workspace.service', () => ({
  getWorkspaceState: () => ({ status: 'loading' }),
  subscribeWorkspace: () => () => undefined,
}));
const pageData = (total = 1, page = 1) => ({
  items: [insight()],
  page,
  limit: 10,
  total,
  pages: Math.ceil(total / 10),
});
beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ status: 'ready', snapshot }, true);
  usePlatformStore.setState({
    pageContext: { url: 'https://x.com/a/status/123' },
  });
  mocks.page.mockResolvedValue(pageData());
  mocks.detail.mockResolvedValue(insight());
  mocks.refresh.mockResolvedValue(undefined);
  mocks.link.mockResolvedValue({
    postId: 'post-1',
    credentialId: 'account-1',
    analyticsAvailability: 'eligible',
  });
});
afterEach(cleanup);
describe('publication scope and explicit selection', () => {
  it('selects only a unique total1 exact match, keeps zero/sample dates and does not retry on focus', async () => {
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.insight?.id).toBe('post-1'));
    expect(mocks.detail).toHaveBeenCalledTimes(1);
    expect(view.result.current.insight?.latestSample?.metrics.views.value).toBe(
      0,
    );
    act(() => window.dispatchEvent(new Event('focus')));
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.detail).toHaveBeenCalledTimes(1);
  });
  it('does not select a lone page item when total>1; explicit choice fetches that post', async () => {
    mocks.page.mockResolvedValue(pageData(11));
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.pageData?.total).toBe(11));
    expect(mocks.detail).not.toHaveBeenCalled();
    act(() => view.result.current.select('unknown'));
    expect(mocks.detail).not.toHaveBeenCalled();
    act(() => view.result.current.select('post-1'));
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
  });
  it.each(['userId', 'organizationId', 'brandId', 'revision'] as const)(
    'discards old delayed results after %s changes',
    async (field) => {
      let finish: (value: ReturnType<typeof pageData>) => void = () =>
        undefined;
      mocks.page.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const view = renderHook(usePublicationInsights);
      act(() =>
        useWorkspaceStore.setState(
          {
            status: 'ready',
            snapshot: {
              ...snapshot,
              [field]: field === 'revision' ? 2 : 'other',
            },
          },
          true,
        ),
      );
      await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2));
      await act(async () => finish(pageData(99)));
      expect(view.result.current.pageData?.total).not.toBe(99);
      expect(mocks.page.mock.calls[0][2].signal.aborted).toBe(true);
    },
  );
  it('hides saved data during refreshing and clears selection on a different URL', async () => {
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    act(() =>
      useWorkspaceStore.setState({ status: 'refreshing', snapshot }, true),
    );
    expect(view.result.current.insight).toBeNull();
    expect(view.result.current.snapshot).toBeNull();
    act(() => useWorkspaceStore.setState({ status: 'ready', snapshot }, true));
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    act(() =>
      usePlatformStore.setState({ pageContext: { url: 'https://x.com/home' } }),
    );
    expect(view.result.current.insight).toBeNull();
    expect(view.result.current.lookup).toBeNull();
  });
  it('resets page/detail during pagination and returns to page1 on reply URL change', async () => {
    mocks.page.mockImplementation((_lookup, page) =>
      Promise.resolve(pageData(11, page)),
    );
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.pageData).not.toBeNull());
    act(() => view.result.current.select('post-1'));
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    act(() => view.result.current.selectPage(2));
    expect(view.result.current.insight).toBeNull();
    await waitFor(() => expect(view.result.current.pageData?.page).toBe(2));
    act(() =>
      usePlatformStore.setState({
        pageContext: { url: 'https://x.com/a/status/456' },
      }),
    );
    expect(view.result.current.page).toBe(1);
    expect(view.result.current.selectedPostId).toBeNull();
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  });
  it('refresh queues once then reads once; retains saved date and rejects duplicate clicks', async () => {
    let finish: () => void = () => undefined;
    mocks.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    act(() => {
      view.result.current.refresh();
      view.result.current.refresh();
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(view.result.current.isBusy).toBe(true);
    await act(async () => finish());
    await waitFor(() => expect(view.result.current.isBusy).toBe(false));
    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(view.result.current.notice).toBe(
      'Analytics refresh requested. Saved metrics may take time to update.',
    );
    expect(view.result.current.insight?.latestSample?.date).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });
  it('link uses original snapshot, reads detail once and never refreshes automatically', async () => {
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    act(() => view.result.current.link('account-1'));
    await waitFor(() =>
      expect(view.result.current.notice).toBe('Account linked'),
    );
    expect(mocks.link.mock.calls[0][2].snapshot).toBe(snapshot);
    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('ignores delayed mutation acknowledgements after navigation', async () => {
    let finish: () => void = () => undefined;
    mocks.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    act(() => view.result.current.refresh());
    act(() =>
      usePlatformStore.setState({ pageContext: { url: 'https://x.com/home' } }),
    );
    await act(async () => finish());
    expect(view.result.current.notice).toBeNull();
    expect(view.result.current.insight).toBeNull();
    expect(mocks.detail).toHaveBeenCalledTimes(1);
  });
  it('retains same-key saved detail on failure; reload only reads and detail404 clears selection', async () => {
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.insight).not.toBeNull());
    mocks.refresh.mockRejectedValue(
      new PublicationInsightsRequestError(
        'rate-limited',
        429,
        'Try again later.',
      ),
    );
    act(() => view.result.current.refresh());
    await waitFor(() =>
      expect(view.result.current.error).toBe('Try again later.'),
    );
    expect(view.result.current.insight).not.toBeNull();
    mocks.detail.mockRejectedValue(
      new PublicationInsightsRequestError(
        'not-found',
        404,
        'This publication is no longer available.',
      ),
    );
    act(() => view.result.current.reload());
    await waitFor(() => expect(view.result.current.selectedPostId).toBeNull());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('rejects detail platform mismatch without displaying metrics', async () => {
    mocks.detail.mockResolvedValue(insight({ platform: 'facebook' }));
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.error).not.toBeNull());
    expect(view.result.current.insight).toBeNull();
  });
});

describe('committed page identity round trips', () => {
  it.each([11, 1, 0])(
    'A2 -> B -> A returns to fresh page1 with total%s and rejects old A2',
    async (total) => {
      const a = 'https://x.com/a/status/123';
      const b = 'https://x.com/b/status/456';
      let aReads = 0;
      let oldFinish: (value: ReturnType<typeof pageData>) => void = () =>
        undefined;
      let newFinish: (value: ReturnType<typeof pageData>) => void = () =>
        undefined;
      mocks.detail.mockImplementation((id: string) =>
        Promise.resolve(insight({ id })),
      );
      mocks.page.mockImplementation((lookup, page) => {
        if (lookup.pageUrl === b)
          return Promise.resolve({
            ...pageData(),
            items: [insight({ id: 'B' })],
          });
        if (page === 2)
          return new Promise((resolve) => {
            oldFinish = resolve;
          });
        if (++aReads === 1)
          return Promise.resolve({
            ...pageData(11),
            items: [insight({ id: 'A' })],
          });
        return new Promise((resolve) => {
          newFinish = resolve;
        });
      });
      const view = renderHook(usePublicationInsights);
      await waitFor(() => expect(view.result.current.pageData?.total).toBe(11));
      act(() => view.result.current.select('A'));
      await waitFor(() => expect(view.result.current.insight?.id).toBe('A'));
      act(() => view.result.current.selectPage(2));
      await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2));
      act(() => usePlatformStore.setState({ pageContext: { url: b } }));
      await waitFor(() => expect(view.result.current.insight?.id).toBe('B'));
      act(() => usePlatformStore.setState({ pageContext: { url: a } }));
      expect(view.result.current.page).toBe(1);
      expect(view.result.current.selectedPostId).toBeNull();
      expect(view.result.current.insight).toBeNull();
      expect(mocks.page.mock.calls.at(-1)?.slice(0, 2)).toEqual([
        { platform: 'twitter', pageUrl: a },
        1,
      ]);
      expect(
        mocks.page.mock.calls.filter(
          ([lookup, page]) => lookup.pageUrl === a && page === 2,
        ),
      ).toHaveLength(1);
      await act(async () =>
        oldFinish({ ...pageData(11, 2), items: [insight({ id: 'old-A2' })] }),
      );
      expect(view.result.current.pageData).toBeNull();
      await act(async () =>
        newFinish({
          ...pageData(total),
          items: total ? [insight({ id: 'new-A' })] : [],
        }),
      );
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      expect(view.result.current.pageData?.total).toBe(total);
      if (total === 1) {
        expect(view.result.current.insight?.id).toBe('new-A');
        expect(
          mocks.detail.mock.calls.filter(([id]) => id === 'new-A'),
        ).toHaveLength(1);
      } else {
        expect(view.result.current.selectedPostId).toBeNull();
        expect(view.result.current.insight).toBeNull();
        expect(
          mocks.detail.mock.calls.filter(([id]) => id === 'new-A'),
        ).toHaveLength(0);
      }
    },
  );
  it.each(['neutral', 'refreshing'] as const)(
    'A2 -> %s -> A resets page1',
    async (transition) => {
      mocks.page.mockImplementation((_lookup, page) =>
        Promise.resolve({
          ...pageData(11, page),
          items: [insight({ id: `A${page}` })],
        }),
      );
      const view = renderHook(usePublicationInsights);
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      act(() => view.result.current.selectPage(2));
      await waitFor(() => expect(view.result.current.pageData?.page).toBe(2));
      if (transition === 'neutral')
        act(() =>
          usePlatformStore.setState({
            pageContext: { url: 'https://x.com/home' },
          }),
        );
      else
        act(() =>
          useWorkspaceStore.setState({ status: 'refreshing', snapshot }, true),
        );
      expect(
        view.result.current.lookup === null ||
          view.result.current.snapshot === null,
      ).toBe(true);
      if (transition === 'neutral')
        act(() =>
          usePlatformStore.setState({
            pageContext: { url: 'https://x.com/a/status/123' },
          }),
        );
      else
        act(() =>
          useWorkspaceStore.setState({ status: 'ready', snapshot }, true),
        );
      expect(view.result.current.page).toBe(1);
      expect(view.result.current.insight).toBeNull();
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      expect(view.result.current.pageData?.page).toBe(1);
      expect(mocks.page.mock.calls.map(([, page]) => page)).toEqual([1, 2, 1]);
    },
  );
});

describe('explicit known-empty pagination recovery', () => {
  it('requests canonical page1 only after explicit recovery from empty page2', async () => {
    let finish: (value: ReturnType<typeof pageData>) => void = () => undefined;
    mocks.page
      .mockResolvedValueOnce(pageData(11))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({ items: [], page: 1, limit: 10, pages: 0, total: 0 });
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    act(() => view.result.current.selectPage(2));
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2));
    await act(async () =>
      finish({ items: [], page: 2, limit: 10, total: 0, pages: 0 }),
    );
    expect(view.result.current.page).toBe(2);
    expect(view.result.current.pageData?.total).toBe(0);
    expect(mocks.page).toHaveBeenCalledTimes(2);
    act(() => view.result.current.selectPage(1));
    await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(3));
    expect(mocks.page.mock.calls[2][1]).toBe(1);
    expect(mocks.page.mock.calls[2][2].snapshot).toBe(snapshot);
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.page).toBe(1);
    expect(view.result.current.pageData?.total).toBe(0);
    expect(view.result.current.selectedPostId).toBeNull();
    expect(view.result.current.insight).toBeNull();
    expect(mocks.detail).not.toHaveBeenCalled();
    act(() => {
      for (const next of [0, 1.5, 2, 5]) view.result.current.selectPage(next);
    });
    expect(mocks.page).toHaveBeenCalledTimes(3);
  });
  it.each([
    [0, 0, 1],
    [1, 1, 1],
    [2, 11, 2],
  ])(
    'page5 shrinking to pages%s total%s explicitly requests%s',
    async (pages, total, target) => {
      let finish: (value: ReturnType<typeof pageData>) => void = () =>
        undefined;
      mocks.page
        .mockResolvedValueOnce(pageData(41))
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        )
        .mockImplementation((_lookup, page) =>
          Promise.resolve({
            items: total === 1 ? [insight({ id: 'fresh' })] : [],
            page,
            limit: 10,
            pages,
            total,
          }),
        );
      mocks.detail.mockResolvedValue(insight({ id: 'fresh' }));
      const view = renderHook(usePublicationInsights);
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      act(() => view.result.current.selectPage(5));
      await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(2));
      act(() => view.result.current.selectPage(1));
      expect(mocks.page).toHaveBeenCalledTimes(2);
      await act(async () =>
        finish({ items: [], page: 5, limit: 10, pages, total }),
      );
      expect(view.result.current.page).toBe(5);
      expect(mocks.page).toHaveBeenCalledTimes(2);
      act(() =>
        view.result.current.selectPage(
          Math.max(1, Math.min(view.result.current.page - 1, pages)),
        ),
      );
      expect(view.result.current.pageData).toBeNull();
      expect(view.result.current.insight).toBeNull();
      await waitFor(() => expect(mocks.page).toHaveBeenCalledTimes(3));
      expect(mocks.page.mock.calls[2][1]).toBe(target);
      expect(mocks.page.mock.calls[2][2].snapshot).toBe(snapshot);
      await waitFor(() => expect(view.result.current.isLoading).toBe(false));
      expect(view.result.current.page).toBe(target);
      expect(view.result.current.pageData?.total).toBe(total);
      if (total === 1) expect(view.result.current.insight?.id).toBe('fresh');
      else expect(view.result.current.insight).toBeNull();
      act(() => view.result.current.selectPage(Math.max(1, pages) + 1));
      expect(mocks.page).toHaveBeenCalledTimes(3);
    },
  );
  it('rejects navigation without known pageData even after loading fails', async () => {
    mocks.page.mockRejectedValue(new Error('offline'));
    const view = renderHook(usePublicationInsights);
    await waitFor(() => expect(view.result.current.error).not.toBeNull());
    act(() => {
      for (const next of [0, 1, 2, 1.5]) view.result.current.selectPage(next);
    });
    expect(mocks.page).toHaveBeenCalledTimes(1);
  });
});
