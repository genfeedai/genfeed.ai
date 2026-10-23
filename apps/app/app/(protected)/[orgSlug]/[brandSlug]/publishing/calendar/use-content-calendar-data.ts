import type {
  IArticle,
  ICalendarSlot,
  IPostingCadence,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { Newsletter } from '@models/content/newsletter.model';
import type { ContentCalendarLoadOptions } from '@props/publishing/content-calendar-controller.props';
import type { ReleaseGroupListQuery } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { useEffect, useState } from 'react';

export function useContentCalendarData({
  brandId,
  campaignId,
  dateRange,
  filters,
  getArticlesService,
  getNewslettersService,
  getPostingCadencesService,
  getReleaseGroupsService,
  notificationsService,
}: ContentCalendarLoadOptions) {
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [releases, setReleases] = useState<IReleaseGroup[]>([]);
  const [slots, setSlots] = useState<ICalendarSlot[]>([]);
  const [cadences, setCadences] = useState<IPostingCadence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    if (!dateRange) {
      return;
    }

    const controller = new AbortController();

    const loadContent = async () => {
      setIsLoading(true);

      try {
        const [
          articlesService,
          releaseGroupsService,
          cadencesService,
          newslettersService,
        ] = await Promise.all([
          getArticlesService(),
          getReleaseGroupsService(),
          getPostingCadencesService(),
          getNewslettersService(),
        ]);

        const window = {
          endDate: dateRange.end.toISOString(),
          startDate: dateRange.start.toISOString(),
        };
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

        const [
          fetchedArticles,
          fetchedReleases,
          fetchedSlots,
          fetchedCadences,
          fetchedNewsletters,
        ] = await Promise.all([
          campaignId
            ? Promise.resolve([])
            : articlesService.findAll(articleQuery),
          releaseGroupsService.findAllPages(releasesQuery, controller.signal),
          brandId && !campaignId
            ? cadencesService.listSlots(
                {
                  brandId,
                  endDate: window.endDate,
                  startDate: window.startDate,
                },
                controller.signal,
              )
            : Promise.resolve([]),
          brandId && !campaignId
            ? cadencesService.list(brandId, controller.signal)
            : Promise.resolve([]),
          campaignId
            ? Promise.resolve([])
            : newslettersService.findAllPages(
                brandId ? { brandId } : {},
                controller.signal,
              ),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setNewsletters(fetchedNewsletters);
        setArticles(fetchedArticles);
        setReleases(fetchedReleases);
        setSlots(fetchedSlots);
        setCadences(fetchedCadences);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load calendar content', error);
        notificationsService.error('Failed to load calendar content');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadContent();

    return () => controller.abort();
  }, [
    dateRange,
    brandId,
    campaignId,
    filters,
    getArticlesService,
    getNewslettersService,
    getPostingCadencesService,
    getReleaseGroupsService,
    notificationsService,
  ]);

  return {
    articles,
    newsletters,
    releases,
    setReleases,
    slots,
    setSlots,
    cadences,
    setCadences,
    isLoading,
  };
}
