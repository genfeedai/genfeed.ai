'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  CampaignStatus,
  CampaignTargetStatus,
  CampaignType,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type CampaignTarget,
  type OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiArrowLeft,
  HiCheck,
  HiPause,
  HiPlay,
  HiRocketLaunch,
} from 'react-icons/hi2';
import OutreachCampaignAddTargets from './OutreachCampaignAddTargets';
import OutreachCampaignDetailHeader from './OutreachCampaignDetailHeader';
import OutreachCampaignTargetsTable from './OutreachCampaignTargetsTable';

export default function OutreachCampaignDetail() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;
  const { organizationId } = useBrand();

  const notificationsService = NotificationsService.getInstance();

  const [campaign, setCampaign] = useState<OutreachCampaign | null>(null);
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isAddingUrls, setIsAddingUrls] = useState(false);

  const getService = useAuthedService((token: string) =>
    OutreachCampaignsService.getInstance(token),
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

      try {
        const service = await getService();
        const [fetchedCampaign, fetchedTargets] = await Promise.all([
          service.findOne(campaignId),
          service.getTargets(campaignId),
        ]);
        setCampaign(fetchedCampaign);
        setTargets(fetchedTargets);
        logger.info('Loaded campaign details', {
          campaignId,
          targetCount: fetchedTargets.length,
        });
      } catch (error) {
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
    if (organizationId && campaignId) {
      loadCampaign();
    }
  }, [organizationId, campaignId, loadCampaign]);

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
      loadCampaign(true);
    } catch (error) {
      logger.error('Failed to add URLs', error);
      notificationsService.error('Failed to add URLs');
    } finally {
      setIsAddingUrls(false);
    }
  }, [urlInput, campaignId, getService, notificationsService, loadCampaign]);

  const handleStartCampaign = useCallback(async () => {
    if (!campaignId) {
      return;
    }

    try {
      const service = await getService();
      const updated = await service.start(campaignId);
      setCampaign(updated);
      notificationsService.success('Campaign started');
    } catch (error) {
      logger.error('Failed to start campaign', error);
      notificationsService.error('Failed to start campaign');
    }
  }, [campaignId, getService, notificationsService]);

  const handlePauseCampaign = useCallback(async () => {
    if (!campaignId) {
      return;
    }

    try {
      const service = await getService();
      const updated = await service.pause(campaignId);
      setCampaign(updated);
      notificationsService.success('Campaign paused');
    } catch (error) {
      logger.error('Failed to pause campaign', error);
      notificationsService.error('Failed to pause campaign');
    }
  }, [campaignId, getService, notificationsService]);

  const handleCompleteCampaign = useCallback(async () => {
    if (!campaignId) {
      return;
    }

    try {
      const service = await getService();
      const updated = await service.complete(campaignId);
      setCampaign(updated);
      notificationsService.success('Campaign completed');
    } catch (error) {
      logger.error('Failed to complete campaign', error);
      notificationsService.error('Failed to complete campaign');
    }
  }, [campaignId, getService, notificationsService]);

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
      loadCampaign(true);
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
      total: targets.length,
    };

    for (const target of targets) {
      const key = statusKeyMap[target.status as CampaignTargetStatus];
      if (key) {
        stats[key]++;
      }
    }

    return stats;
  }, [targets]);

  if (isLoading) {
    return (
      <Container
        label="Loading..."
        description="Loading campaign details"
        icon={HiRocketLaunch}
      >
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin text-4xl text-primary">⏳</div>
        </div>
      </Container>
    );
  }

  if (!campaign) {
    return (
      <Container
        label="Campaign Not Found"
        description="The requested campaign could not be found"
        icon={HiRocketLaunch}
      >
        <Button
          label={
            <>
              <HiArrowLeft /> Back to Campaigns
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={() => router.push('/orchestration/outreach-campaigns')}
        />
      </Container>
    );
  }

  return (
    <Container
      label={campaign.label}
      description={campaign.description || 'Campaign details and targets'}
      icon={HiRocketLaunch}
      right={
        <>
          <ButtonRefresh
            onClick={() => loadCampaign(true)}
            isRefreshing={isRefreshing}
          />

          {campaign.status === CampaignStatus.ACTIVE ? (
            <Button
              label={
                <>
                  <HiPause /> Pause
                </>
              }
              variant={ButtonVariant.DESTRUCTIVE}
              onClick={handlePauseCampaign}
            />
          ) : campaign.status !== CampaignStatus.COMPLETED ? (
            <Button
              label={
                <>
                  <HiPlay /> Start
                </>
              }
              variant={ButtonVariant.DEFAULT}
              onClick={handleStartCampaign}
            />
          ) : null}

          {campaign.status !== CampaignStatus.COMPLETED && (
            <Button
              label={
                <>
                  <HiCheck /> Complete
                </>
              }
              variant={ButtonVariant.SECONDARY}
              onClick={handleCompleteCampaign}
            />
          )}
        </>
      }
    >
      <div className="space-y-6">
        <OutreachCampaignDetailHeader
          platform={campaign.platform}
          status={campaign.status}
          onBack={() => router.push('/orchestration/outreach-campaigns')}
        />

        <KPISection
          title="Target Statistics"
          gridCols={{ desktop: 6, mobile: 2, tablet: 3 }}
          items={[
            {
              description: 'All targets',
              label: 'Total',
              value: targetStats.total,
            },
            {
              description: 'Waiting',
              label: 'Pending',
              value: targetStats.pending,
            },
            {
              description: 'In progress',
              label: 'Processing',
              value: targetStats.processing,
              valueClassName: 'text-warning',
            },
            {
              description: 'Successfully replied',
              label: 'Replied',
              value: targetStats.replied,
              valueClassName: 'text-success',
            },
            ...(campaign.campaignType === CampaignType.DM_OUTREACH
              ? [
                  {
                    description: 'DMs successfully sent',
                    label: 'DMs Sent',
                    value: campaign.totalDmsSent || 0,
                    valueClassName: 'text-success',
                  },
                ]
              : []),
            {
              description: 'Skipped',
              label: 'Skipped',
              value: targetStats.skipped,
            },
            {
              description: 'Errors',
              label: 'Failed',
              value: targetStats.failed,
              valueClassName: 'text-destructive',
            },
          ]}
        />

        <OutreachCampaignAddTargets
          campaignType={campaign.campaignType}
          urlInput={urlInput}
          isAddingUrls={isAddingUrls}
          onUrlInputChange={setUrlInput}
          onAddUrls={handleAddUrls}
          onAddDmRecipients={handleAddDmRecipients}
        />

        <OutreachCampaignTargetsTable
          campaignType={campaign.campaignType}
          targets={targets}
          isRefreshing={isRefreshing}
        />
      </div>
    </Container>
  );
}
