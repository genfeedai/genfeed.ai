import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { Article } from '@models/content/article.model';
import type { ArticlesService } from '@services/content/articles.service';
import type { NewslettersService } from '@services/content/newsletters.service';
import type { PostingCadencesService } from '@services/content/posting-cadences.service';
import type { ReleaseGroupsService } from '@services/content/release-groups.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContentCalendarDateRange,
  ContentCalendarLoadOptions,
} from '@/features/posts/props/content-calendar-controller.props';
import { EMPTY_RELEASE_CALENDAR_FILTERS } from './release-calendar-filters';
import { useContentCalendarData } from './use-content-calendar-data';

const services = vi.hoisted(() => ({
  findAll: vi.fn<ArticlesService['findAll']>(),
  findAllPages: vi.fn<ReleaseGroupsService['findAllPages']>(),
  list: vi.fn<PostingCadencesService['list']>(),
  listSlots: vi.fn<PostingCadencesService['listSlots']>(),
  newsletters: vi.fn<NewslettersService['findAllPages']>(),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@services/content/articles.service', () => ({
  ArticlesService: { getInstance: () => ({ findAll: services.findAll }) },
}));
vi.mock('@services/content/release-groups.service', () => ({
  ReleaseGroupsService: {
    getInstance: () => ({ findAllPages: services.findAllPages }),
  },
}));
vi.mock('@services/content/posting-cadences.service', () => ({
  PostingCadencesService: {
    getInstance: () => ({ list: services.list, listSlots: services.listSlots }),
  },
}));
vi.mock('@services/content/newsletters.service', () => ({
  NewslettersService: {
    getInstance: () => ({ findAllPages: services.newsletters }),
  },
}));

const notifyError = vi.fn();
const OCTOBER_WEEK: ContentCalendarDateRange = {
  end: new Date('2026-10-25T00:00:00Z'),
  start: new Date('2026-10-18T00:00:00Z'),
};
const NOVEMBER_WEEK: ContentCalendarDateRange = {
  end: new Date('2026-11-08T00:00:00Z'),
  start: new Date('2026-11-01T00:00:00Z'),
};
const OPTIONS: ContentCalendarLoadOptions = {
  brandId: 'brand-fixture',
  dateRange: OCTOBER_WEEK,
  filters: EMPTY_RELEASE_CALENDAR_FILTERS,
  notificationsService: { error: notifyError },
};
const RELEASE = { id: 'release-1', title: 'Launch' } as IReleaseGroup;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('calendar loading boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    services.findAll.mockResolvedValue([]);
    services.findAllPages.mockResolvedValue([RELEASE]);
    services.list.mockResolvedValue([]);
    services.listSlots.mockResolvedValue([]);
    services.newsletters.mockResolvedValue([]);
  });

  it('keeps campaign views release-only and omits empty facets from the request', async () => {
    const { result } = renderHook(
      () =>
        useContentCalendarData({ ...OPTIONS, campaignId: 'campaign-fixture' }),
      { wrapper: queryClientWrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(services.findAllPages).toHaveBeenCalledWith(
      {
        brandId: 'brand-fixture',
        campaignId: 'campaign-fixture',
        startDate: '2026-10-18T00:00:00.000Z',
        endDate: '2026-10-25T00:00:00.000Z',
      },
      expect.any(AbortSignal),
    );
    expect(services.findAll).not.toHaveBeenCalled();
    expect(services.listSlots).not.toHaveBeenCalled();
    expect(result.current.releases).toEqual([RELEASE]);
  });

  it('aborts the active load when the page unmounts', async () => {
    const pending = deferred<Article[]>();
    services.findAll.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(services.findAllPages).toHaveBeenCalledOnce());
    const signal = services.findAllPages.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve([]);
      await pending.promise;
    });
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('does not overwrite the new date window with a late previous response', async () => {
    const pending = deferred<Article[]>();
    const current = new Article({ id: 'current', label: 'Current' });
    services.findAll
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([current]);
    const { result, rerender } = renderHook(
      ({ dateRange }) => useContentCalendarData({ ...OPTIONS, dateRange }),
      {
        initialProps: { dateRange: OCTOBER_WEEK },
        wrapper: queryClientWrapper(),
      },
    );
    await waitFor(() => expect(services.findAll).toHaveBeenCalledOnce());
    rerender({ dateRange: NOVEMBER_WEEK });
    await waitFor(() => expect(result.current.articles[0]?.id).toBe('current'));
    await act(async () => {
      pending.resolve([new Article({ id: 'stale' })]);
      await pending.promise;
    });
    expect(result.current.articles[0]?.id).toBe('current');
    expect(result.current.isLoading).toBe(false);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('paints the cached schedule at once when the calendar is opened again', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.releases).toEqual([RELEASE]),
    );
    first.unmount();

    services.findAllPages.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.releases).toEqual([RELEASE]);
  });

  it('never shows one brand the schedule cached for another', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.releases).toEqual([RELEASE]),
    );
    first.unmount();

    services.findAllPages.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(
      () => useContentCalendarData({ ...OPTIONS, brandId: 'brand-other' }),
      { wrapper: queryClientWrapper(client) },
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.releases).toEqual([]);
  });

  it('keeps an optimistic edit in the cache for the next visit', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.releases).toEqual([RELEASE]),
    );
    act(() => {
      first.result.current.setReleases((current) =>
        current.map((release) => ({ ...release, title: 'Moved' })),
      );
    });
    await waitFor(() =>
      expect(first.result.current.releases[0]?.title).toBe('Moved'),
    );
    first.unmount();

    services.findAllPages.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.releases[0]?.title).toBe('Moved');
  });

  it('keeps the schedule on screen when a background refresh fails', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(result.current.releases).toEqual([RELEASE]));

    services.findAllPages.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['content-calendar'] });
    });

    await waitFor(() => expect(result.current.releases).toEqual([RELEASE]));
    expect(result.current.isLoading).toBe(false);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('says so when the first read fails', async () => {
    services.findAllPages.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useContentCalendarData(OPTIONS), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'Failed to load calendar content',
      ),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.releases).toEqual([]);
  });
});
