'use client';

import { ButtonVariant, CampaignStatus } from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  type OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { PagesService } from '@services/content/pages.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Plus, Rocket } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo } from 'react';
import type { OutreachCampaignsData } from '@/features/agents/props/outreach-campaigns-list.props';

import OutreachCampaignsKPI from './OutreachCampaignsKPI';
import OutreachCampaignsTable from './OutreachCampaignsTable';

const EMPTY_CAMPAIGNS: OutreachCampaign[] = [];

export default function OutreachCampaignsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { href } = useOrgUrl();
  const translate = useTranslations('common.outreachCampaign');
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const isFetchReady = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });

  const notificationsService = NotificationsService.getInstance();

  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    OutreachCampaignsService.getInstance(token),
  );

  // `all` is every campaign (the KPIs summarise all of them); `page` is the
  // current server page the table shows. Cached: coming back paints both
  // while they refresh, and paging keeps the KPIs on screen.
  const scopeKey = [
    'outreach-campaigns',
    organizationId ?? null,
    { brandId: brandId ?? null },
  ] as const;
  const campaignsQuery = useAuthedQuery<
    OutreachCampaignsService,
    OutreachCampaignsData
  >({
    enabled: isFetchReady,
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      try {
        const [all, page] = await Promise.all([
          service.findAllByOrganization(organizationId, brandId, signal),
          service.findPageByOrganization(
            organizationId,
            { brandId, limit: ITEMS_PER_PAGE, page: currentPage },
            signal,
          ),
        ]);
        logger.info('Loaded campaigns', { count: all.length });
        // `findPageByOrganization` recorded the table page's totals; keep them
        // with this cached read.
        return { all, page, totals: PagesService.snapshot() };
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load campaigns', error);
        }
        throw error;
      }
    },
    queryKey: [...scopeKey, { page: currentPage }],
    service: (token: string) => OutreachCampaignsService.getInstance(token),
  });
  const { errorUpdatedAt, isError, isFetching, isPending, refetch } =
    campaignsQuery;
  // Pending, not just fetching: until the scope is ready and the first read
  // lands, the KPIs and table are skeletons, never zeros.
  const isLoading = isPending;
  const campaigns = campaignsQuery.data?.all ?? EMPTY_CAMPAIGNS;
  const pageCampaigns = campaignsQuery.data?.page ?? EMPTY_CAMPAIGNS;
  const isRefreshing = isFetching && !isPending;

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error(translate('notifications.loadFailed'));
    }
  }, [errorUpdatedAt, isError, notificationsService, translate]);

  const updateCachedCampaigns = useCallback(
    (update: (items: OutreachCampaign[]) => OutreachCampaign[]) => {
      queryClient.setQueriesData<OutreachCampaignsData>(
        { queryKey: ['outreach-campaigns'] },
        (current) =>
          current
            ? {
                ...current,
                all: update(current.all),
                page: update(current.page),
              }
            : current,
      );
    },
    [queryClient],
  );

  const patchCampaign = useCallback(
    (id: string, patch: Partial<OutreachCampaign>) => {
      updateCachedCampaigns((items) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [updateCachedCampaigns],
  );

  const handleStartCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      try {
        const service = await getService();
        await service.start(campaign.id);

        patchCampaign(campaign.id, { status: CampaignStatus.ACTIVE });

        notificationsService.success(
          translate('notifications.started', { label: campaign.label }),
        );
      } catch (error) {
        logger.error('Failed to start campaign', error);
        notificationsService.error(translate('notifications.startFailed'));
      }
    },
    [getService, notificationsService, patchCampaign, translate],
  );

  const handlePauseCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      try {
        const service = await getService();
        await service.pause(campaign.id);

        patchCampaign(campaign.id, { status: CampaignStatus.PAUSED });

        notificationsService.success(
          translate('notifications.paused', { label: campaign.label }),
        );
      } catch (error) {
        logger.error('Failed to pause campaign', error);
        notificationsService.error(translate('notifications.pauseFailed'));
      }
    },
    [getService, notificationsService, patchCampaign, translate],
  );

  const handleCompleteCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      try {
        const service = await getService();
        await service.complete(campaign.id);

        patchCampaign(campaign.id, { status: CampaignStatus.COMPLETED });

        notificationsService.success(
          translate('notifications.completed', { label: campaign.label }),
        );
      } catch (error) {
        logger.error('Failed to complete campaign', error);
        notificationsService.error(translate('notifications.completeFailed'));
      }
    },
    [getService, notificationsService, patchCampaign, translate],
  );

  const handleCreateCampaign = useCallback(() => {
    router.push(href(APP_ROUTES.MESSAGES.OUTREACH_NEW));
  }, [href, router]);

  const handleConfigureCampaign = useCallback(
    (campaign: OutreachCampaign) => {
      router.push(href(`${APP_ROUTES.MESSAGES.OUTREACH}/${campaign.id}`));
    },
    [href, router],
  );

  const handleDeleteCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      if (!confirm(`Are you sure you want to delete "${campaign.label}"?`)) {
        return;
      }

      try {
        const service = await getService();
        await service.delete(campaign.id);

        updateCachedCampaigns((items) =>
          items.filter((item) => item.id !== campaign.id),
        );
        notificationsService.success(
          translate('notifications.deleted', { label: campaign.label }),
        );
      } catch (error) {
        logger.error('Failed to delete campaign', error);
        notificationsService.error(translate('notifications.deleteFailed'));
      }
    },
    [getService, notificationsService, translate, updateCachedCampaigns],
  );

  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === CampaignStatus.ACTIVE),
    [campaigns],
  );

  const totalReplies = useMemo(
    () => campaigns.reduce((sum, c) => sum + c.totalSuccessful, 0),
    [campaigns],
  );

  const successRate = useMemo(() => {
    const totalAttempted = campaigns.reduce(
      (sum, c) => sum + c.totalReplies,
      0,
    );
    if (totalAttempted === 0) {
      return 0;
    }
    return Math.round(
      (campaigns.reduce((sum, c) => sum + c.totalSuccessful, 0) /
        totalAttempted) *
        100,
    );
  }, [campaigns]);

  return (
    <Container
      label="Outreach sequences"
      icon={Rocket}
      refresh={
        <ButtonRefresh
          onClick={() => {
            void refetch();
          }}
          isRefreshing={isRefreshing}
        />
      }
      right={
        <Button
          label={
            <>
              <Plus /> New sequence
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={handleCreateCampaign}
        />
      }
    >
      <div className="space-y-6">
        <OutreachCampaignsKPI
          campaigns={campaigns}
          isLoading={isLoading}
          activeCampaignsCount={activeCampaigns.length}
          totalReplies={totalReplies}
          successRate={successRate}
        />

        <OutreachCampaignsTable
          campaigns={pageCampaigns}
          isLoading={isLoading}
          onStart={handleStartCampaign}
          onPause={handlePauseCampaign}
          onComplete={handleCompleteCampaign}
          onConfigure={handleConfigureCampaign}
          onDelete={handleDeleteCampaign}
        />
        {!isLoading && pageCampaigns.length > 0 ? (
          <AutoPagination
            showTotal
            totalLabel="sequences"
            totals={campaignsQuery.data?.totals}
          />
        ) : null}
      </div>
    </Container>
  );
}
