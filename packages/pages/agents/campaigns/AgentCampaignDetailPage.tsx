'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IAgentCampaignStatusResponse } from '@genfeedai/contracts/interfaces';
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
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Check, LayoutDashboard, Pause, Play } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import AgentCampaignAgentsList from './AgentCampaignAgentsList';
import AgentCampaignContentQuota from './AgentCampaignContentQuota';
import AgentCampaignDetailHeader from './AgentCampaignDetailHeader';

export default function AgentCampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
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
    if (!campaignId) return;
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
              <ArrowLeft /> Back to Programs
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

          {campaign.status === 'active' ? (
            <Button
              label={
                <>
                  <Pause /> Pause
                </>
              }
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handlePause}
            />
          ) : campaign.status !== 'completed' ? (
            <Button
              label={
                <>
                  <Play /> Start
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleExecute}
              isDisabled={isExecuting}
            />
          ) : null}

          {campaign.status !== 'completed' && (
            <Button
              label={
                <>
                  <Check /> Complete
                </>
              }
              variant={ButtonVariant.SECONDARY}
              onClick={handleComplete}
            />
          )}
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
