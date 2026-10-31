import { Article } from '@models/content/article.model';
import type { ArticlesService } from '@services/content/articles.service';
import type { NewslettersService } from '@services/content/newsletters.service';
import type { PostingCadencesService } from '@services/content/posting-cadences.service';
import type { ReleaseGroupsService } from '@services/content/release-groups.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContentCalendarLoadOptions } from '@/features/posts/props/content-calendar-controller.props';
import { EMPTY_RELEASE_CALENDAR_FILTERS } from './release-calendar-filters';
import { useContentCalendarData } from './use-content-calendar-data';

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const findAll = vi.fn<ArticlesService['findAll']>().mockResolvedValue([]);
  const findAllPages = vi
    .fn<ReleaseGroupsService['findAllPages']>()
    .mockResolvedValue([]);
  const list = vi.fn<PostingCadencesService['list']>().mockResolvedValue([]);
  const listSlots = vi
    .fn<PostingCadencesService['listSlots']>()
    .mockResolvedValue([]);
  const newsletters = vi
    .fn<NewslettersService['findAllPages']>()
    .mockResolvedValue([]);
  const error = vi.fn();
  const options: ContentCalendarLoadOptions = {
    brandId: 'brand-fixture',
    dateRange: {
      start: new Date('2026-10-18T00:00:00Z'),
      end: new Date('2026-10-25T00:00:00Z'),
    },
    filters: EMPTY_RELEASE_CALENDAR_FILTERS,
    getArticlesService: async () => ({ findAll }),
    getReleaseGroupsService: async () => ({ findAllPages }),
    getPostingCadencesService: async () => ({ list, listSlots }),
    getNewslettersService: async () => ({ findAllPages: newsletters }),
    notificationsService: { error },
  };
  return {
    options,
    findAll,
    findAllPages,
    list,
    listSlots,
    newsletters,
    error,
  };
}

describe('calendar loading boundary', () => {
  it('keeps campaign views release-only and omits empty facets from the request', async () => {
    const fixture = setup();
    const { result } = renderHook(() =>
      useContentCalendarData({
        ...fixture.options,
        campaignId: 'campaign-fixture',
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fixture.findAllPages).toHaveBeenCalledWith(
      {
        brandId: 'brand-fixture',
        campaignId: 'campaign-fixture',
        startDate: '2026-10-18T00:00:00.000Z',
        endDate: '2026-10-25T00:00:00.000Z',
      },
      expect.any(AbortSignal),
    );
    expect(fixture.findAll).not.toHaveBeenCalled();
    expect(fixture.list).not.toHaveBeenCalled();
    expect(fixture.listSlots).not.toHaveBeenCalled();
    expect(fixture.newsletters).not.toHaveBeenCalled();
  });
  it('aborts the active load when the page unmounts', async () => {
    const fixture = setup();
    const pending = deferred<Article[]>();
    fixture.findAll.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() =>
      useContentCalendarData(fixture.options),
    );
    await waitFor(() => expect(fixture.findAllPages).toHaveBeenCalledOnce());
    const signal = fixture.findAllPages.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pending.resolve([]);
      await pending.promise;
    });
    expect(fixture.error).not.toHaveBeenCalled();
  });
  it('does not overwrite the new date window with a late previous response', async () => {
    const fixture = setup();
    const pending = deferred<Article[]>();
    const current = new Article({ id: 'current', label: 'Current' });
    fixture.findAll
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([current]);
    const { result, rerender } = renderHook(
      ({ dateRange }) =>
        useContentCalendarData({ ...fixture.options, dateRange }),
      { initialProps: { dateRange: fixture.options.dateRange } },
    );
    await waitFor(() => expect(fixture.findAll).toHaveBeenCalledOnce());
    rerender({
      dateRange: {
        start: new Date('2026-11-01T00:00:00Z'),
        end: new Date('2026-11-08T00:00:00Z'),
      },
    });
    await waitFor(() => expect(result.current.articles[0]?.id).toBe('current'));
    await act(async () => {
      pending.resolve([new Article({ id: 'stale' })]);
      await pending.promise;
    });
    expect(result.current.articles[0]?.id).toBe('current');
    expect(result.current.isLoading).toBe(false);
    expect(fixture.error).not.toHaveBeenCalled();
  });
});
