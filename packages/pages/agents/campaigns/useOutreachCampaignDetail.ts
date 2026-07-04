import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import { CampaignTargetStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type CampaignTarget,
  type OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useOutreachCampaignDetail() {
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

  const handleBack = useCallback(() => {
    router.push(APP_ROUTES.ORCHESTRATION.OUTREACH_CAMPAIGNS);
  }, [router]);

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
    loadCampaign,
    setUrlInput,
    targetStats,
    targets,
    urlInput,
  };
}
