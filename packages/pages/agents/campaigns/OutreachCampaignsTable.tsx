'use client';

import {
  ButtonSize,
  ButtonVariant,
  CampaignPlatform,
  CampaignStatus,
  CampaignType,
} from '@genfeedai/enums';
import type { OutreachCampaign } from '@services/automation/outreach-campaigns.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { useMemo } from 'react';
import { FaInstagram, FaReddit, FaXTwitter } from 'react-icons/fa6';
import {
  HiArrowPath,
  HiCheck,
  HiCog6Tooth,
  HiPause,
  HiPlay,
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

type Props = {
  campaigns: OutreachCampaign[];
  isLoading: boolean;
  onStart: (campaign: OutreachCampaign) => void;
  onPause: (campaign: OutreachCampaign) => void;
  onComplete: (campaign: OutreachCampaign) => void;
  onConfigure: (campaign: OutreachCampaign) => void;
  onDelete: (campaign: OutreachCampaign) => void;
};

export default function OutreachCampaignsTable({
  campaigns,
  isLoading,
  onStart,
  onPause,
  onComplete,
  onConfigure,
  onDelete,
}: Props) {
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
            onPause(campaign);
          } else if (campaign.status !== CampaignStatus.COMPLETED) {
            onStart(campaign);
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
        onClick: onComplete,
        size: ButtonSize.SM,
        tooltip: 'Mark Complete',
        variant: ButtonVariant.SECONDARY,
      },
      {
        icon: <HiCog6Tooth />,
        onClick: onConfigure,
        size: ButtonSize.SM,
        tooltip: 'Configure',
        variant: ButtonVariant.SECONDARY,
      },
      {
        icon: <HiTrash />,
        onClick: onDelete,
        size: ButtonSize.SM,
        tooltip: 'Delete',
        variant: ButtonVariant.DESTRUCTIVE,
      },
    ],
    [onStart, onPause, onComplete, onConfigure, onDelete],
  );

  return (
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
  );
}
