'use client';

import { ButtonVariant, CampaignStatus } from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
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
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Plus, Rocket } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import OutreachCampaignsKPI from './OutreachCampaignsKPI';
import OutreachCampaignsTable from './OutreachCampaignsTable';

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

  // `campaigns` is every campaign (the KPIs summarise all of them); the table
  // shows only the current server page.
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [pageCampaigns, setPageCampaigns] = useState<OutreachCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getService = useAuthedService((token: string) =>
    OutreachCampaignsService.getInstance(token),
  );

  const loadCampaigns = useCallback(
    async (refresh = false, signal?: AbortSignal) => {
      if (!isFetchReady) {
        return;
      }

      if (!refresh) {
        setIsLoading(true);
      }
      setIsRefreshing(refresh);

      try {
        const service = await getService();
        const [fetchedCampaigns, fetchedPage] = await Promise.all([
          service.findAllByOrganization(organizationId, brandId, signal),
          service.findPageByOrganization(
            organizationId,
            { brandId, limit: ITEMS_PER_PAGE, page: currentPage },
            signal,
          ),
        ]);
        if (signal?.aborted) {
          return;
        }
        setCampaigns(fetchedCampaigns);
        setPageCampaigns(fetchedPage);
        logger.info('Loaded campaigns', { count: fetchedCampaigns.length });
      } catch (error) {
        if (
          signal?.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        logger.error('Failed to load campaigns', error);
        notificationsService.error(translate('notifications.loadFailed'));
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      brandId,
      currentPage,
      getService,
      isFetchReady,
      notificationsService,
      organizationId,
      translate,
    ],
  );

  useEffect(() => {
    if (!isFetchReady) {
      return;
    }
    const controller = new AbortController();
    void loadCampaigns(false, controller.signal);
    return () => controller.abort();
  }, [isFetchReady, loadCampaigns]);

  const patchCampaign = useCallback(
    (id: string, patch: Partial<OutreachCampaign>) => {
      const apply = (items: OutreachCampaign[]) =>
        items.map((item) => (item.id === id ? { ...item, ...patch } : item));
      setCampaigns(apply);
      setPageCampaigns(apply);
    },
    [],
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

        const withoutCampaign = (items: OutreachCampaign[]) =>
          items.filter((item) => item.id !== campaign.id);
        setCampaigns(withoutCampaign);
        setPageCampaigns(withoutCampaign);
        notificationsService.success(
          translate('notifications.deleted', { label: campaign.label }),
        );
      } catch (error) {
        logger.error('Failed to delete campaign', error);
        notificationsService.error(translate('notifications.deleteFailed'));
      }
    },
    [getService, notificationsService, translate],
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
      description="DM and growth sequences for launches and distribution."
      icon={Rocket}
      refresh={
        <ButtonRefresh
          onClick={() => loadCampaigns(true)}
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
          <AutoPagination showTotal totalLabel="sequences" />
        ) : null}
      </div>
    </Container>
  );
}
