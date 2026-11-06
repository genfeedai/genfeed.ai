import { useBrand } from '@contexts/user/brand-context/brand-context';
import { CampaignTargetStatus } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  type CampaignTarget,
  type CampaignTargetsPage,
  type OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_TARGETS: CampaignTarget[] = [];
const EMPTY_STATUS_COUNTS: Partial<Record<CampaignTargetStatus, number>> = {};

export function useOutreachCampaignDetail() {
  const router = useRouter();
  const { href } = useOrgUrl();
  const params = useRouteParams();
  const campaignId = params.id as string;
  const { organizationId } = useBrand();
  const translate = useTranslations('common.outreachCampaign');

  const notificationsService = NotificationsService.getInstance();

  const currentPage = Number(useSearchParams().get('page')) || 1;
  const [urlInput, setUrlInput] = useState('');
  const [isAddingUrls, setIsAddingUrls] = useState(false);
  const [isStartingCampaign, setIsStartingCampaign] = useState(false);
  // A ref, not the `isStartingCampaign` state: two rapid clicks in the same
  // tick both close over the same stale state value, but a ref read is
  // synchronous and current, so the second call is blocked before either
  // request fires a duplicate paid campaign run.
  const isStartingCampaignRef = useRef(false);

  const getService = useAuthedService((token: string) =>
    OutreachCampaignsService.getInstance(token),
  );

  // The campaign and its current page of targets are cached per viewer,
  // organization and campaign (and page), so coming back paints them at once
  // and refreshes in the background; paging keeps the KPIs on screen.
  const queryClient = useQueryClient();
  const isFetchReady = Boolean(organizationId && campaignId);
  const campaignKey = useMemo(
    () => ['outreach-campaign', organizationId ?? null, campaignId ?? null],
    [campaignId, organizationId],
  );
  const targetsScopeKey = [
    'outreach-campaign-targets',
    organizationId ?? null,
    campaignId ?? null,
  ] as const;
  const campaignQuery = useAuthedQuery({
    enabled: isFetchReady,
    queryFn: (service, signal) => service.findOne(campaignId, {}, signal),
    queryKey: campaignKey,
    service: (token: string) => OutreachCampaignsService.getInstance(token),
  });
  const targetsQuery = useAuthedQuery({
    enabled: isFetchReady,
    keepPreviousDataWithin: targetsScopeKey,
    queryFn: async (service, signal) => {
      const targetsPage = await service.getTargets(
        campaignId,
        { limit: ITEMS_PER_PAGE, page: currentPage },
        signal,
      );
      logger.info('Loaded campaign details', {
        campaignId,
        targetCount: targetsPage.total,
      });
      return targetsPage;
    },
    queryKey: [...targetsScopeKey, { page: currentPage }],
    service: (token: string) => OutreachCampaignsService.getInstance(token),
  });

  const campaign = campaignQuery.data ?? null;
  // A page that fails to load blanks only its own rows: the campaign-wide
  // KPIs and page totals stay from the last page read for this campaign.
  const targetsScopeId = targetsScopeKey.join(':');
  const lastTargetPageRef = useRef<CampaignTargetsPage | null>(null);
  const lastTargetScopeRef = useRef<string | null>(null);
  const loadedTargetPage = targetsQuery.data;
  useEffect(() => {
    if (loadedTargetPage) {
      lastTargetPageRef.current = loadedTargetPage;
      lastTargetScopeRef.current = targetsScopeId;
    }
  }, [loadedTargetPage, targetsScopeId]);
  const lastTargetPage =
    lastTargetScopeRef.current === targetsScopeId
      ? lastTargetPageRef.current
      : null;
  const targetPage = loadedTargetPage ?? lastTargetPage;
  const targets = loadedTargetPage?.targets ?? EMPTY_TARGETS;
  const statusCounts = targetPage?.statusCounts ?? EMPTY_STATUS_COUNTS;
  const isLoading = campaignQuery.isPending || targetsQuery.isPending;
  const isRefreshing =
    (campaignQuery.isFetching && !campaignQuery.isPending) ||
    (targetsQuery.isFetching && !targetsQuery.isPending);
  const loadError = campaignQuery.error ?? targetsQuery.error;
  const loadErrorUpdatedAt = Math.max(
    campaignQuery.errorUpdatedAt,
    targetsQuery.errorUpdatedAt,
  );

  // One toast per failed read; a failed background refresh keeps what is on
  // screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadErrorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (!loadError) {
      return;
    }
    logger.error('Failed to load campaign', loadError);
    notificationsService.error(translate('notifications.loadFailed'));
  }, [loadError, loadErrorUpdatedAt, notificationsService, translate]);

  const { refetch: refetchCampaign } = campaignQuery;
  // Every load after the first is a background refresh that keeps the
  // campaign on screen. Every cached target page is marked stale, not just
  // this one: adding targets changes their totals and counts too.
  const loadCampaign = useCallback(async () => {
    if (!isFetchReady) {
      return;
    }
    await Promise.all([
      refetchCampaign(),
      queryClient.invalidateQueries({
        queryKey: [
          'outreach-campaign-targets',
          organizationId ?? null,
          campaignId ?? null,
        ],
      }),
    ]);
  }, [campaignId, isFetchReady, organizationId, queryClient, refetchCampaign]);

  const setCampaign = useCallback(
    async (updated: OutreachCampaign) => {
      // A read still in flight would land the older campaign after this write.
      await queryClient.cancelQueries({ queryKey: campaignKey });
      queryClient.setQueriesData<OutreachCampaign>(
        { queryKey: campaignKey },
        updated,
      );
      // The campaigns list shows the status too.
      void queryClient.invalidateQueries({ queryKey: ['outreach-campaigns'] });
    },
    [campaignKey, queryClient],
  );

  const handleAddUrls = useCallback(async () => {
    if (!urlInput.trim() || !campaignId) {
      return;
    }

    setIsAddingUrls(true);

    try {
      const service = await getService();
      const urls = urlInput
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      const result = await service.addTargets(campaignId, urls);

      notificationsService.success(
        `Added ${result.added} targets (${result.skipped} skipped)`,
      );
      setUrlInput('');
      void loadCampaign();
    } catch (error) {
      logger.error('Failed to add URLs', error);
      notificationsService.error('Failed to add URLs');
    } finally {
      setIsAddingUrls(false);
    }
  }, [urlInput, campaignId, getService, notificationsService, loadCampaign]);

  const handleStartCampaign = useCallback(async () => {
    if (!campaignId || isStartingCampaignRef.current) {
      return;
    }
    isStartingCampaignRef.current = true;
    setIsStartingCampaign(true);

    try {
      const service = await getService();
      const updated = await service.start(campaignId);
      await setCampaign(updated);
      notificationsService.success(translate('notifications.startedPlain'));
    } catch (error) {
      logger.error('Failed to start campaign', error);
      notificationsService.error(translate('notifications.startFailed'));
    } finally {
      isStartingCampaignRef.current = false;
      setIsStartingCampaign(false);
    }
  }, [campaignId, getService, notificationsService, setCampaign, translate]);

  const handlePauseCampaign = useCallback(async () => {
    if (!campaignId) {
      return;
    }

    try {
      const service = await getService();
      const updated = await service.pause(campaignId);
      await setCampaign(updated);
      notificationsService.success(translate('notifications.pausedPlain'));
    } catch (error) {
      logger.error('Failed to pause campaign', error);
      notificationsService.error(translate('notifications.pauseFailed'));
    }
  }, [campaignId, getService, notificationsService, setCampaign, translate]);

  const handleCompleteCampaign = useCallback(async () => {
    if (!campaignId) {
      return;
    }

    try {
      const service = await getService();
      const updated = await service.complete(campaignId);
      await setCampaign(updated);
      notificationsService.success(translate('notifications.completedPlain'));
    } catch (error) {
      logger.error('Failed to complete campaign', error);
      notificationsService.error(translate('notifications.completeFailed'));
    }
  }, [campaignId, getService, notificationsService, setCampaign, translate]);

  const handleAddDmRecipients = useCallback(async () => {
    if (!urlInput.trim() || !campaignId) {
      return;
    }

    setIsAddingUrls(true);

    try {
      const service = await getService();
      const usernames = urlInput
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      const result = await service.addDmRecipients(campaignId, usernames);

      notificationsService.success(
        `Added ${result.added} recipients (${result.skipped} skipped)`,
      );
      setUrlInput('');
      void loadCampaign();
    } catch (error) {
      logger.error('Failed to add recipients', error);
      notificationsService.error('Failed to add recipients');
    } finally {
      setIsAddingUrls(false);
    }
  }, [urlInput, campaignId, getService, notificationsService, loadCampaign]);

  const targetStats = useMemo(() => {
    const statusKeyMap: Record<CampaignTargetStatus, keyof typeof stats> = {
      [CampaignTargetStatus.PENDING]: 'pending',
      [CampaignTargetStatus.SCHEDULED]: 'scheduled',
      [CampaignTargetStatus.PROCESSING]: 'processing',
      [CampaignTargetStatus.REPLIED]: 'replied',
      [CampaignTargetStatus.SENT]: 'sent',
      [CampaignTargetStatus.SKIPPED]: 'skipped',
      [CampaignTargetStatus.FAILED]: 'failed',
    };

    const stats = {
      failed: 0,
      pending: 0,
      processing: 0,
      replied: 0,
      scheduled: 0,
      sent: 0,
      skipped: 0,
      total: 0,
    };

    // Counted across the whole campaign by the API, not from the loaded page.
    for (const [status, count = 0] of Object.entries(statusCounts)) {
      stats.total += count;
      const key = statusKeyMap[status as CampaignTargetStatus];
      if (key) {
        stats[key] += count;
      }
    }

    return stats;
  }, [statusCounts]);

  const handleBack = useCallback(() => {
    router.push(href(APP_ROUTES.MESSAGES.OUTREACH));
  }, [href, router]);

  return {
    campaign,
    handleAddDmRecipients,
    handleAddUrls,
    handleBack,
    handleCompleteCampaign,
    handlePauseCampaign,
    handleStartCampaign,
    isAddingUrls,
    isLoading,
    isRefreshing,
    isStartingCampaign,
    loadCampaign,
    setUrlInput,
    targetStats,
    pageTotals: targetPage
      ? { totalDocs: targetPage.total, totalPages: targetPage.totalPages }
      : EMPTY_PAGE_TOTALS,
    targets,
    urlInput,
  };
}
