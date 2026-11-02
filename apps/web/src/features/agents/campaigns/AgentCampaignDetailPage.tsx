'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Check, LayoutDashboard, Pause, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecordFactLine from '@/components/record-detail/RecordFactLine';
import { useAgentStrategies } from '@/features/agents/hooks/agent-strategies/use-agent-strategies';
import AgentCampaignAgentsList from './AgentCampaignAgentsList';
import AgentCampaignContentQuota from './AgentCampaignContentQuota';
import AgentCampaignDetailHeader from './AgentCampaignDetailHeader';
import { buildAgentCampaignFacts } from './agent-campaign-detail-facts.helper';
import CampaignNeedsYou from './CampaignNeedsYou';
import { getCampaignPrimaryActionKind } from './campaign-primary-action.helper';

export default function AgentCampaignDetailPage() {
  const router = useRouter();
  const params = useRouteParams();
  const campaignId = params.id as string;
  const translate = useTranslations('common.agentCampaign');
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const isFetchReady = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });
  const { href } = useOrgUrl();
  const { isLoading: areAgentsLoading, strategies } = useAgentStrategies({
    ...toBrandListParams({ brandId }),
    enabled: isFetchReady,
  });

  const notificationsService = NotificationsService.getInstance();

  const [isExecuting, setIsExecuting] = useState(false);
  // A ref (not the `isExecuting` state) guards re-entrancy: two rapid clicks
  // in the same tick both close over the same stale `isExecuting`, but a ref
  // read is synchronous and current, so the second call is blocked before
  // either request fires a duplicate paid Program run.
  const isExecutingRef = useRef(false);

  const getService = useAuthedService((token: string) =>
    AgentCampaignsService.getInstance(token),
  );

  // Cached per Program and brand scope: coming back to a Program paints it at
  // once while it refreshes. A Program from another selected brand resolves to
  // null (not found), and its status is never read.
  const scopedBrandId = pageScope === 'brand' ? (brandId ?? null) : null;
  const campaignQuery = useAuthedQuery({
    enabled: isFetchReady && Boolean(campaignId),
    queryFn: async (service) => {
      try {
        const campaign = await service.getById(campaignId);
        if (scopedBrandId && campaign.brandId !== scopedBrandId) {
          return { campaign: null, status: null };
        }

        try {
          return { campaign, status: await service.getStatus(campaignId) };
        } catch (statusError) {
          logger.warn('Failed to load Program status', statusError);
          return { campaign, status: null };
        }
      } catch (error) {
        logger.error('Failed to load Program', error);
        throw error;
      }
    },
    queryKey: ['agent-campaign', campaignId, { brandId: scopedBrandId }],
    service: (token: string) => AgentCampaignsService.getInstance(token),
  });
  const { errorUpdatedAt, isError, isPending, isRefetching, refetch } =
    campaignQuery;
  const campaign = campaignQuery.data?.campaign ?? null;
  const status = campaignQuery.data?.status ?? null;

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load Program');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  const loadCampaign = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleExecute = useCallback(async () => {
    if (!campaignId || isExecutingRef.current) return;
    isExecutingRef.current = true;
    setIsExecuting(true);

    try {
      const service = await getService();
      await service.execute(campaignId);
      notificationsService.success('Program started');
      loadCampaign();
    } catch (error) {
      logger.error('Failed to execute Program', error);
      notificationsService.error('Failed to start Program');
    } finally {
      isExecutingRef.current = false;
      setIsExecuting(false);
    }
  }, [campaignId, getService, notificationsService, loadCampaign]);

  const handlePause = useCallback(async () => {
    if (!campaignId) return;

    try {
      const service = await getService();
      await service.pause(campaignId);
      notificationsService.success('Program paused');
      loadCampaign();
    } catch (error) {
      logger.error('Failed to pause Program', error);
      notificationsService.error('Failed to pause Program');
    }
  }, [campaignId, getService, notificationsService, loadCampaign]);

  const handleComplete = useCallback(async () => {
    if (!campaignId) return;

    try {
      const service = await getService();
      await service.update(campaignId, { status: 'completed' });
      notificationsService.success('Program completed');
      loadCampaign();
    } catch (error) {
      logger.error('Failed to complete Program', error);
      notificationsService.error('Failed to complete Program');
    }
  }, [campaignId, getService, notificationsService, loadCampaign]);

  // Resume when paused, Pause when running, Start for a never-run draft.
  // Complete moves into the overflow menu alongside every other action.
  const primaryActionKind = campaign
    ? getCampaignPrimaryActionKind(campaign.status)
    : null;
  const primary = useMemo(() => {
    switch (primaryActionKind) {
      case 'pause':
        return (
          <Button
            icon={<Pause className="size-4" />}
            label={translate('detail.pause')}
            onClick={handlePause}
            variant={ButtonVariant.DEFAULT}
          />
        );
      case 'resume':
      case 'start':
        return (
          <Button
            icon={<Play className="size-4" />}
            isDisabled={isExecuting}
            label={translate(
              primaryActionKind === 'resume' ? 'detail.resume' : 'detail.start',
            )}
            onClick={handleExecute}
            variant={ButtonVariant.DEFAULT}
          />
        );
      default:
        return undefined;
    }
  }, [handleExecute, handlePause, isExecuting, primaryActionKind, translate]);

  const overflow = useMemo<CollectionOverflowAction[]>(() => {
    if (!campaign || campaign.status === 'completed') {
      return [];
    }
    return [
      {
        icon: <Check className="size-4" />,
        id: 'complete',
        label: translate('detail.complete'),
        onSelect: handleComplete,
      },
    ];
  }, [campaign, handleComplete, translate]);

  if (!isFetchReady || isPending) {
    return (
      <Container label="Loading..." icon={LayoutDashboard}>
        <div className="space-y-6">
          <SkeletonCard
            label="Loading Program"
            showDescription={false}
            showImage={false}
          />
          <SkeletonCard label="Loading Program agents" showImage={false} />
        </div>
      </Container>
    );
  }

  if (!campaign) {
    return (
      <Container label="Program Not Found" icon={LayoutDashboard}>
        <Button
          label={
            <>
              <ArrowLeft /> {translate('detail.backToPrograms')}
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={() => router.push(href(APP_ROUTES.AUTOMATION.CAMPAIGNS))}
        />
      </Container>
    );
  }

  return (
    <Container
      label={campaign.label}
      icon={LayoutDashboard}
      refresh={
        <ButtonRefresh onClick={loadCampaign} isRefreshing={isRefetching} />
      }
      right={<CollectionItemActions overflow={overflow} primary={primary} />}
    >
      <div className="space-y-6">
        <AgentCampaignDetailHeader
          campaign={campaign}
          onBack={() => router.push(href(APP_ROUTES.AUTOMATION.CAMPAIGNS))}
          status={status}
        />

        <RecordFactLine
          facts={buildAgentCampaignFacts(
            campaign,
            translate(`status.${campaign.status}`),
          )}
        />

        <CampaignNeedsYou
          isExecuting={isExecuting}
          isPaused={campaign.status === 'paused'}
          onResume={handleExecute}
          pausedDescription={translate('detail.needsYou.pausedDescription')}
          resumeLabel={translate('detail.needsYou.resume')}
          title={translate('detail.needsYou.title')}
        />

        {campaign.contentQuota && (
          <AgentCampaignContentQuota contentQuota={campaign.contentQuota} />
        )}

        <AgentCampaignAgentsList
          agentIds={campaign.agents}
          isLoading={areAgentsLoading}
          strategies={strategies}
        />
      </div>
    </Container>
  );
}
