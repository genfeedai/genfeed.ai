import type {
  IArticle,
  ICalendarSlot,
  IPostingCadence,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Newsletter } from '@models/content/newsletter.model';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostingCadencesService } from '@services/content/posting-cadences.service';
import {
  type ReleaseGroupListQuery,
  ReleaseGroupsService,
} from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { useQueryClient } from '@tanstack/react-query';
import { type SetStateAction, useCallback, useEffect, useMemo } from 'react';
import type {
  ContentCalendarData,
  ContentCalendarLoadOptions,
  ContentCalendarServices,
} from '@/features/posts/props/content-calendar-controller.props';

const LOAD_ERROR = 'Failed to load calendar content';
const EMPTY_ARTICLES: IArticle[] = [];
const EMPTY_NEWSLETTERS: Newsletter[] = [];
const EMPTY_RELEASES: IReleaseGroup[] = [];
const EMPTY_SLOTS: ICalendarSlot[] = [];
const EMPTY_CADENCES: IPostingCadence[] = [];

function createContentCalendarServices(token: string): ContentCalendarServices {
  return {
    articles: ArticlesService.getInstance(token),
    cadences: PostingCadencesService.getInstance(token),
    newsletters: NewslettersService.getInstance(token),
    releaseGroups: ReleaseGroupsService.getInstance(token),
  };
}

function resolveAction<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function'
    ? (action as (previous: T) => T)(current)
    : action;
}

/**
 * Loads everything the publishing calendar draws for one brand (or campaign)
 * and date window: articles, newsletters, releases, cadence slots and the
 * cadences themselves.
 *
 * The read is cached per viewer, brand, campaign, window and filters, so
 * coming back to the calendar paints the last schedule at once and refreshes
 * it in the background. A filter change keeps the current window's events on
 * screen while the narrower read loads; another window or brand never shows
 * this one's events. The `set*` writers update the cached entry the calendar
 * is showing, so optimistic edits survive a revisit.
 */
export function useContentCalendarData({
  brandId,
  campaignId,
  dateRange,
  filters,
  notificationsService,
}: ContentCalendarLoadOptions) {
  const queryClient = useQueryClient();
  const startDate = dateRange?.start.toISOString() ?? null;
  const endDate = dateRange?.end.toISOString() ?? null;

  const windowKey = useMemo(
    () => [
      'content-calendar',
      brandId || null,
      campaignId ?? null,
      { endDate, startDate },
    ],
    [brandId, campaignId, endDate, startDate],
  );
  const queryKey = useMemo(() => [...windowKey, filters], [filters, windowKey]);

  const calendarQuery = useAuthedQuery<
    ContentCalendarServices,
    ContentCalendarData
  >({
    enabled: startDate !== null && endDate !== null,
    keepPreviousDataWithin: windowKey,
    queryFn: async (services, signal) => {
      if (!startDate || !endDate) {
        throw new Error('content_calendar_window_required');
      }
      const window = { endDate, startDate };
      const articleQuery = {
        ...window,
        ...(brandId ? { brandId } : {}),
      };

      // Empty facets are omitted rather than sent as empty arrays: the DTO
      // treats a present-but-empty filter as "match nothing".
      const releasesQuery: ReleaseGroupListQuery = {
        ...window,
        ...(brandId ? { brandId } : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(filters.credentialId.length
          ? { credentialId: filters.credentialId }
          : {}),
        ...(filters.executionState.length
          ? { executionState: filters.executionState }
          : {}),
        ...(filters.platform.length ? { platform: filters.platform } : {}),
        ...(filters.source.length ? { source: filters.source } : {}),
        ...(filters.status.length ? { status: filters.status } : {}),
      };

      try {
        const [articles, releases, slots, cadences, newsletters] =
          await Promise.all([
            campaignId
              ? Promise.resolve([])
              : services.articles.findAll(articleQuery, signal),
            services.releaseGroups.findAllPages(releasesQuery, signal),
            brandId && !campaignId
              ? services.cadences.listSlots(
                  { brandId, endDate, startDate },
                  signal,
                )
              : Promise.resolve([]),
            brandId && !campaignId
              ? services.cadences.list(brandId, signal)
              : Promise.resolve([]),
            campaignId
              ? Promise.resolve([])
              : services.newsletters.findAllPages(
                  brandId ? { brandId } : {},
                  signal,
                ),
          ]);
        return { articles, cadences, newsletters, releases, slots };
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load calendar content', error);
        }
        throw error;
      }
    },
    queryKey,
    service: createContentCalendarServices,
  });

  const data = calendarQuery.data;
  const hasData = data !== undefined;
  const { error } = calendarQuery;
  // A failed first read says so; a failed background refresh keeps the
  // calendar that is on screen without a toast.
  useEffect(() => {
    if (error && !hasData) {
      notificationsService.error(LOAD_ERROR);
    }
  }, [error, hasData, notificationsService]);

  const updateCalendar = useCallback(
    (update: (current: ContentCalendarData) => ContentCalendarData) => {
      queryClient.setQueriesData<ContentCalendarData>(
        { queryKey },
        (current) => (current ? update(current) : current),
      );
    },
    [queryClient, queryKey],
  );

  const setReleases = useCallback(
    (action: SetStateAction<IReleaseGroup[]>) =>
      updateCalendar((current) => ({
        ...current,
        releases: resolveAction(action, current.releases),
      })),
    [updateCalendar],
  );
  const setSlots = useCallback(
    (action: SetStateAction<ICalendarSlot[]>) =>
      updateCalendar((current) => ({
        ...current,
        slots: resolveAction(action, current.slots),
      })),
    [updateCalendar],
  );
  // Content changed elsewhere (the agent drafted or scheduled a post, an
  // article was saved): read the window again. The key is built from the
  // window's dates, so re-setting the same range would not refetch.
  const { refetch } = calendarQuery;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const setCadences = useCallback(
    (action: SetStateAction<IPostingCadence[]>) =>
      updateCalendar((current) => ({
        ...current,
        cadences: resolveAction(action, current.cadences),
      })),
    [updateCalendar],
  );

  return {
    articles: data?.articles ?? EMPTY_ARTICLES,
    newsletters: data?.newsletters ?? EMPTY_NEWSLETTERS,
    releases: data?.releases ?? EMPTY_RELEASES,
    setReleases,
    slots: data?.slots ?? EMPTY_SLOTS,
    setSlots,
    cadences: data?.cadences ?? EMPTY_CADENCES,
    setCadences,
    reload,
    // The skeleton shows only while nothing is cached for this window yet.
    isLoading: calendarQuery.isPending,
  };
}
