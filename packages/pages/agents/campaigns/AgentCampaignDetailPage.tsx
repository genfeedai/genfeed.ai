'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IAgentCampaignStatusResponse } from '@genfeedai/contracts/interfaces';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentStrategies } from '@hooks/data/agent-strategies/use-agent-strategies';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import RecordFactLine from '@ui/record-detail/RecordFactLine';
import { ArrowLeft, Check, LayoutDashboard, Pause, Play } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentCampaignAgentsList from './AgentCampaignAgentsList';
import AgentCampaignContentQuota from './AgentCampaignContentQuota';
import AgentCampaignDetailHeader from './AgentCampaignDetailHeader';
import { buildAgentCampaignFacts } from './agent-campaign-detail-facts.helper';
import CampaignNeedsYou from './CampaignNeedsYou';
import { getCampaignPrimaryActionKind } from './campaign-primary-action.helper';

export default function AgentCampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
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

  const [campaign, setCampaign] = useState<AgentCampaign | null>(null);
  const [status, setStatus] = useState<IAgentCampaignStatusResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const loadGenerationRef = useRef(0);
  // A ref (not the `isExecuting` state) guards re-entrancy: two rapid clicks
  // in the same tick both close over the same stale `isExecuting`, but a ref
  // read is synchronous and current, so the second call is blocked before
  // either request fires a duplicate paid Program run.
  const isExecutingRef = useRef(false);

  const getService = useAuthedService((token: string) =>
    AgentCampaignsService.getInstance(token),
  );

  const loadCampaign = useCallback(
    async (refresh = false) => {
      if (!isFetchReady || !campaignId) {
        return;
      }

      const generation = ++loadGenerationRef.current;
      const isCurrentLoad = () => loadGenerationRef.current === generation;

      if (!refresh) {
        setIsLoading(true);
        setCampaign(null);
        setStatus(null);
      }
      setIsRefreshing(refresh);

      try {
        const service = await getService();
        if (!isCurrentLoad()) return;

        const fetchedCampaign = await service.getById(campaignId);
        if (!isCurrentLoad()) return;

        if (
          pageScope === 'brand' &&
          brandId &&
          fetchedCampaign.brandId !== brandId
        ) {
          setCampaign(null);
          setStatus(null);
          return;
        }
        setCampaign(fetchedCampaign);

        // Fetch status separately
        try {
          const statusResponse = await service.getStatus(campaignId);
          if (!isCurrentLoad()) return;
          setStatus(statusResponse);
        } catch (statusError) {
          if (!isCurrentLoad()) return;
          logger.warn('Failed to load Program status', statusError);
        }
      } catch (error) {
        if (!isCurrentLoad()) return;
        logger.error('Failed to load Program', error);
        notificationsService.error('Failed to load Program');
      } finally {
        if (isCurrentLoad()) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      brandId,
      campaignId,
      getService,
      isFetchReady,
      notificationsService,
      pageScope,
    ],
  );

  useEffect(() => {
    if (isFetchReady && campaignId) {
      loadCampaign();
    }

    return () => {
      loadGenerationRef.current += 1;
    };
  }, [campaignId, isFetchReady, loadCampaign]);

  const handleExecute = useCallback(async () => {
    if (!campaignId || isExecutingRef.current) return;
    isExecutingRef.current = true;
    setIsExecuting(true);

    try {
      const service = await getService();
      await service.execute(campaignId);
      notificationsService.success('Program started');
      loadCampaign(true);
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
      loadCampaign(true);
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
      loadCampaign(true);
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

  const isChangingBrand =
    pageScope === 'brand' &&
    Boolean(brandId) &&
    campaign !== null &&
    campaign.brandId !== brandId;

  if (!isFetchReady || isLoading || isChangingBrand) {
    return (
      <Container
        label="Loading..."
        description="Loading Program details"
        icon={LayoutDashboard}
      >
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-foreground/50">Loading…</div>
        </div>
      </Container>
    );
  }

  if (!campaign) {
    return (
      <Container
        label="Program Not Found"
        description="The requested Program could not be found"
        icon={LayoutDashboard}
      >
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

  const creditsPercent =
    campaign.creditsAllocated > 0
      ? Math.round((campaign.creditsUsed / campaign.creditsAllocated) * 100)
      : 0;

  return (
    <Container
      label={campaign.label}
      description={campaign.brief || 'Program details and execution status'}
      icon={LayoutDashboard}
      right={
        <>
          <ButtonRefresh
            onClick={() => loadCampaign(true)}
            isRefreshing={isRefreshing}
          />

          <CollectionItemActions overflow={overflow} primary={primary} />
        </>
      }
    >
      <div className="space-y-6">
        <AgentCampaignDetailHeader
          campaign={campaign}
          creditsPercent={creditsPercent}
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
