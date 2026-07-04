'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import type { IAgentCampaignStatusResponse } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { AgentCampaignsService } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  HiArrowLeft,
  HiCheck,
  HiOutlineRectangleGroup,
  HiPause,
  HiPlay,
} from 'react-icons/hi2';
import AgentCampaignAgentsList from './AgentCampaignAgentsList';
import AgentCampaignContentQuota from './AgentCampaignContentQuota';
import AgentCampaignDetailHeader from './AgentCampaignDetailHeader';

export default function AgentCampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
  const { organizationId } = useBrand();

  const notificationsService = NotificationsService.getInstance();

  const [campaign, setCampaign] = useState<AgentCampaign | null>(null);
  const [status, setStatus] = useState<IAgentCampaignStatusResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const getService = useAuthedService((token: string) =>
    AgentCampaignsService.getInstance(token),
  );

  const loadCampaign = useCallback(
    async (refresh = false) => {
      if (!organizationId || !campaignId) {
        return;
      }

      if (!refresh) {
        setIsLoading(true);
      }
      setIsRefreshing(refresh);

      const controller = new AbortController();

      try {
        const service = await getService();
        const fetchedCampaign = await service.getById(campaignId);
        setCampaign(fetchedCampaign);

        // Fetch status separately
        try {
          const statusResponse = await service.getStatus(campaignId);
          setStatus(statusResponse);
        } catch (statusError) {
          logger.warn('Failed to load campaign status', statusError);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('Failed to load campaign', error);
        notificationsService.error('Failed to load campaign');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [organizationId, campaignId, getService, notificationsService],
  );

  useEffect(() => {
    const controller = new AbortController();

    if (organizationId && campaignId) {
      loadCampaign();
    }

    return () => {
      controller.abort();
    };
  }, [organizationId, campaignId, loadCampaign]);

  const handleExecute = useCallback(async () => {
    if (!campaignId) return;
    setIsExecuting(true);

    try {
      const service = await getService();
      await service.execute(campaignId);
      notificationsService.success('Campaign started');
      loadCampaign(true);
    } catch (error) {
      logger.error('Failed to execute campaign', error);
      notificationsService.error('Failed to start campaign');
    } finally {
      setIsExecuting(false);
    }
  }, [campaignId, getService, notificationsService, loadCampaign]);

  const handlePause = useCallback(async () => {
    if (!campaignId) return;

    try {
      const service = await getService();
      await service.pause(campaignId);
      notificationsService.success('Campaign paused');
      loadCampaign(true);
    } catch (error) {
      logger.error('Failed to pause campaign', error);
      notificationsService.error('Failed to pause campaign');
    }
  }, [campaignId, getService, notificationsService, loadCampaign]);

  const handleComplete = useCallback(async () => {
    if (!campaignId) return;

    try {
      const service = await getService();
      await service.update(campaignId, { status: 'completed' });
      notificationsService.success('Campaign completed');
      loadCampaign(true);
    } catch (error) {
      logger.error('Failed to complete campaign', error);
      notificationsService.error('Failed to complete campaign');
    }
  }, [campaignId, getService, notificationsService, loadCampaign]);

  if (isLoading) {
    return (
      <Container
        label="Loading..."
        description="Loading campaign details"
        icon={HiOutlineRectangleGroup}
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
        label="Campaign Not Found"
        description="The requested campaign could not be found"
        icon={HiOutlineRectangleGroup}
      >
        <Button
          label={
            <>
              <HiArrowLeft /> Back to Campaigns
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={() => router.push(APP_ROUTES.ORCHESTRATION.CAMPAIGNS)}
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
      description={campaign.brief || 'Campaign details and execution status'}
      icon={HiOutlineRectangleGroup}
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
                  <HiPause /> Pause
                </>
              }
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handlePause}
            />
          ) : campaign.status !== 'completed' ? (
            <Button
              label={
                <>
                  <HiPlay /> Start
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
                  <HiCheck /> Complete
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
          onBack={() => router.push(APP_ROUTES.ORCHESTRATION.CAMPAIGNS)}
          status={status}
        />

        {campaign.contentQuota && (
          <AgentCampaignContentQuota contentQuota={campaign.contentQuota} />
        )}

        <AgentCampaignAgentsList agents={campaign.agents} />
      </div>
    </Container>
  );
}
