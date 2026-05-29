'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, CampaignStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiPlus, HiRocketLaunch } from 'react-icons/hi2';
import OutreachCampaignsKPI from './OutreachCampaignsKPI';
import OutreachCampaignsTable from './OutreachCampaignsTable';

export default function OutreachCampaignsList() {
  const router = useRouter();
  const { brandId, organizationId } = useBrand();

  const notificationsService = NotificationsService.getInstance();

  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getService = useAuthedService((token: string) =>
    OutreachCampaignsService.getInstance(token),
  );

  const loadCampaigns = useCallback(
    async (refresh = false) => {
      if (!organizationId) {
        return;
      }

      if (!refresh) {
        setIsLoading(true);
      }
      setIsRefreshing(refresh);

      try {
        const service = await getService();
        const fetchedCampaigns = await service.findAllByOrganization(
          organizationId,
          brandId,
        );
        setCampaigns(fetchedCampaigns);
        logger.info('Loaded campaigns', { count: fetchedCampaigns.length });
      } catch (error) {
        logger.error('Failed to load campaigns', error);
        notificationsService.error('Failed to load campaigns');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [brandId, organizationId, getService, notificationsService],
  );

  useEffect(() => {
    if (organizationId) {
      loadCampaigns();
    }
  }, [organizationId, loadCampaigns]);

  const handleStartCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      try {
        const service = await getService();
        await service.start(campaign.id);

        setCampaigns((prev) =>
          prev.map((item) =>
            item.id === campaign.id
              ? { ...item, status: CampaignStatus.ACTIVE }
              : item,
          ),
        );

        notificationsService.success(`Campaign "${campaign.label}" started`);
      } catch (error) {
        logger.error('Failed to start campaign', error);
        notificationsService.error('Failed to start campaign');
      }
    },
    [getService, notificationsService],
  );

  const handlePauseCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      try {
        const service = await getService();
        await service.pause(campaign.id);

        setCampaigns((prev) =>
          prev.map((item) =>
            item.id === campaign.id
              ? { ...item, status: CampaignStatus.PAUSED }
              : item,
          ),
        );

        notificationsService.success(`Campaign "${campaign.label}" paused`);
      } catch (error) {
        logger.error('Failed to pause campaign', error);
        notificationsService.error('Failed to pause campaign');
      }
    },
    [getService, notificationsService],
  );

  const handleCompleteCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      try {
        const service = await getService();
        await service.complete(campaign.id);

        setCampaigns((prev) =>
          prev.map((item) =>
            item.id === campaign.id
              ? { ...item, status: CampaignStatus.COMPLETED }
              : item,
          ),
        );

        notificationsService.success(`Campaign "${campaign.label}" completed`);
      } catch (error) {
        logger.error('Failed to complete campaign', error);
        notificationsService.error('Failed to complete campaign');
      }
    },
    [getService, notificationsService],
  );

  const handleCreateCampaign = useCallback(() => {
    router.push('/orchestration/outreach-campaigns/new');
  }, [router]);

  const handleConfigureCampaign = useCallback(
    (campaign: OutreachCampaign) => {
      router.push(`/orchestration/outreach-campaigns/${campaign.id}`);
    },
    [router],
  );

  const handleDeleteCampaign = useCallback(
    async (campaign: OutreachCampaign) => {
      if (!confirm(`Are you sure you want to delete "${campaign.label}"?`)) {
        return;
      }

      try {
        const service = await getService();
        await service.delete(campaign.id);

        setCampaigns((prev) => prev.filter((item) => item.id !== campaign.id));
        notificationsService.success(`Campaign "${campaign.label}" deleted`);
      } catch (error) {
        logger.error('Failed to delete campaign', error);
        notificationsService.error('Failed to delete campaign');
      }
    },
    [getService, notificationsService],
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
      label="Marketing Campaigns"
      description="Outreach for launches and distribution."
      icon={HiRocketLaunch}
      right={
        <>
          <ButtonRefresh
            onClick={() => loadCampaigns(true)}
            isRefreshing={isRefreshing}
          />

          <Button
            label={
              <>
                <HiPlus /> New Campaign
              </>
            }
            variant={ButtonVariant.DEFAULT}
            onClick={handleCreateCampaign}
          />
        </>
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
          campaigns={campaigns}
          isLoading={isLoading}
          onStart={handleStartCampaign}
          onPause={handlePauseCampaign}
          onComplete={handleCompleteCampaign}
          onConfigure={handleConfigureCampaign}
          onDelete={handleDeleteCampaign}
        />
      </div>
    </Container>
  );
}
