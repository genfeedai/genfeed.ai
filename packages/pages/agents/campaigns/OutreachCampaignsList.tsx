'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  OutreachCampaign,
  OutreachCampaignsService,
} from '@services/automation/outreach-campaigns.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaInstagram, FaReddit, FaXTwitter } from 'react-icons/fa6';
import {
  HiArrowPath,
  HiCheck,
  HiCog6Tooth,
  HiPause,
  HiPlay,
  HiPlus,
  HiRocketLaunch,
  HiTrash,
} from 'react-icons/hi2';

const platformIcons: Record<CampaignPlatform, React.ReactNode> = {
  [CampaignPlatform.TWITTER]: <FaXTwitter className="text-slate-300" />,
  [CampaignPlatform.REDDIT]: <FaReddit className="text-orange-500" />,
  [CampaignPlatform.INSTAGRAM]: <FaInstagram className="text-pink-500" />,
};

const typeLabels: Record<CampaignType, string> = {
  [CampaignType.MANUAL]: 'Manual',
  [CampaignType.DISCOVERY]: 'Discovery',
  [CampaignType.SCHEDULED_BLAST]: 'Scheduled',
  [CampaignType.DM_OUTREACH]: 'DM Outreach',
};

const statusVariants: Record<
  CampaignStatus,
  'success' | 'warning' | 'secondary' | 'destructive'
> = {
  [CampaignStatus.DRAFT]: 'secondary',
  [CampaignStatus.ACTIVE]: 'success',
  [CampaignStatus.PAUSED]: 'warning',
  [CampaignStatus.COMPLETED]: 'destructive',
};

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
  }, [brandId, organizationId, loadCampaigns]);

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

  const columns = useMemo(
    () => [
      {
        header: 'Campaign',
        key: 'name',
        render: (campaign: OutreachCampaign) => (
          <div className="flex flex-col">
            <span className="font-medium">{campaign.label}</span>
            <span className="text-xs uppercase tracking-wide text-foreground/50">
              {typeLabels[campaign.campaignType]}
            </span>
            {campaign.description && (
              <span className="text-sm text-foreground/60">
                {campaign.description}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (campaign: OutreachCampaign) => (
          <Badge variant={statusVariants[campaign.status]}>
            {campaign.status}
          </Badge>
        ),
      },
      {
        header: 'Platform',
        key: 'platform',
        render: (campaign: OutreachCampaign) => (
          <div className="flex items-center gap-2">
            {platformIcons[campaign.platform]}
            <span className="text-sm capitalize">{campaign.platform}</span>
          </div>
        ),
      },
      {
        header: 'Targets',
        key: 'targets',
        render: (campaign: OutreachCampaign) => (
          <div className="flex flex-col text-sm">
            <span>{campaign.totalTargets.toLocaleString()} total</span>
            <span className="text-xs text-foreground/60">
              {campaign.totalSuccessful.toLocaleString()} replied
            </span>
          </div>
        ),
      },
      {
        header: 'Progress',
        key: 'progress',
        render: (campaign: OutreachCampaign) => {
          const total = campaign.totalTargets;
          const processed =
            campaign.totalSuccessful +
            campaign.totalFailed +
            campaign.totalSkipped;
          const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

          return (
            <div className="flex flex-col gap-1">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full bg-success transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs text-foreground/60">{percent}%</span>
            </div>
          );
        },
      },
      {
        header: 'Rate Limits',
        key: 'rateLimits',
        render: (campaign: OutreachCampaign) => (
          <div className="flex flex-col text-sm">
            <span>{campaign.rateLimits?.maxPerHour || 10}/hr</span>
            <span className="text-xs text-foreground/60">
              {campaign.rateLimits?.maxPerDay || 50}/day
            </span>
          </div>
        ),
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      {
        icon: (campaign: OutreachCampaign) => {
          if (campaign.status === CampaignStatus.ACTIVE) {
            return <HiPause />;
          }
          if (campaign.status === CampaignStatus.COMPLETED) {
            return <HiArrowPath />;
          }
          return <HiPlay />;
        },
        onClick: (campaign: OutreachCampaign) => {
          if (campaign.status === CampaignStatus.ACTIVE) {
            handlePauseCampaign(campaign);
          } else if (campaign.status !== CampaignStatus.COMPLETED) {
            handleStartCampaign(campaign);
          }
        },
        size: ButtonSize.SM,
        tooltip: (campaign: OutreachCampaign) => {
          if (campaign.status === CampaignStatus.ACTIVE) {
            return 'Pause';
          }
          if (campaign.status === CampaignStatus.COMPLETED) {
            return 'Completed';
          }
          return 'Start';
        },
        variant: ButtonVariant.DEFAULT,
      },
      {
        icon: <HiCheck />,
        onClick: handleCompleteCampaign,
        size: ButtonSize.SM,
        tooltip: 'Mark Complete',
        variant: ButtonVariant.SECONDARY,
      },
      {
        icon: <HiCog6Tooth />,
        onClick: handleConfigureCampaign,
        size: ButtonSize.SM,
        tooltip: 'Configure',
        variant: ButtonVariant.SECONDARY,
      },
      {
        icon: <HiTrash />,
        onClick: handleDeleteCampaign,
        size: ButtonSize.SM,
        tooltip: 'Delete',
        variant: ButtonVariant.DESTRUCTIVE,
      },
    ],
    [
      handleStartCampaign,
      handlePauseCampaign,
      handleCompleteCampaign,
      handleConfigureCampaign,
      handleDeleteCampaign,
    ],
  );

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
        <KPISection
          title="Campaign Statistics"
          gridCols={{ desktop: 4, mobile: 2, tablet: 4 }}
          items={[
            {
              description: 'All campaigns',
              label: 'Total Campaigns',
              value: campaigns.length,
            },
            {
              description: 'Currently running',
              label: 'Active',
              value: activeCampaigns.length,
              valueClassName: 'text-success',
            },
            {
              description: 'Successfully posted',
              label: 'Total Replies',
              value: totalReplies.toLocaleString(),
            },
            {
              description: 'Of all attempts',
              label: 'Success Rate',
              value: `${successRate}%`,
              valueClassName:
                successRate >= 80 ? 'text-success' : 'text-warning',
            },
          ]}
        />

        <div className="overflow-x-auto">
          <AppTable<OutreachCampaign>
            items={campaigns}
            columns={columns}
            actions={actions}
            isLoading={isLoading}
            getRowKey={(campaign) => campaign.id}
            emptyLabel="No campaigns created yet"
          />
        </div>
      </div>
    </Container>
  );
}
