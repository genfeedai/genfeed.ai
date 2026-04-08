'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  CampaignPlatform,
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
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Textarea from '@ui/inputs/textarea/Textarea';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button, Button as PrimitiveButton } from '@ui/primitives/button';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaInstagram, FaReddit, FaXTwitter } from 'react-icons/fa6';
import {
  HiArrowLeft,
  HiCheck,
  HiPause,
  HiPlay,
  HiPlus,
  HiRocketLaunch,
} from 'react-icons/hi2';

const platformIcons: Record<CampaignPlatform, React.ReactNode> = {
  [CampaignPlatform.TWITTER]: <FaXTwitter className="text-slate-300" />,
  [CampaignPlatform.REDDIT]: <FaReddit className="text-orange-500" />,
  [CampaignPlatform.INSTAGRAM]: <FaInstagram className="text-pink-500" />,
};

const targetStatusVariants: Record<
  string,
  'success' | 'warning' | 'secondary' | 'error'
> = {
  [CampaignTargetStatus.PENDING]: 'secondary',
  [CampaignTargetStatus.SCHEDULED]: 'secondary',
  [CampaignTargetStatus.PROCESSING]: 'warning',
  [CampaignTargetStatus.REPLIED]: 'success',
  [CampaignTargetStatus.SENT]: 'success',
  [CampaignTargetStatus.SKIPPED]: 'warning',
  [CampaignTargetStatus.FAILED]: 'error',
};

function getCampaignStatusVariant(
  status: CampaignStatus,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case CampaignStatus.ACTIVE:
      return 'success';
    case CampaignStatus.PAUSED:
      return 'warning';
    case CampaignStatus.COMPLETED:
      return 'destructive';
    default:
      return 'secondary';
  }
}

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

  const targetColumns = useMemo(
    () => [
      {
        header: 'Author',
        key: 'author',
        render: (target: CampaignTarget) => (
          <div className="flex flex-col">
            <span className="font-medium">@{target.authorUsername}</span>
            {target.matchedKeyword && (
              <span className="text-xs text-foreground/60">
                Keyword: {target.matchedKeyword}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Content',
        key: 'content',
        render: (target: CampaignTarget) => (
          <div className="max-w-xs truncate text-sm text-foreground/80">
            {target.contentText || '-'}
          </div>
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (target: CampaignTarget) => (
          <Badge variant={targetStatusVariants[target.status] || 'secondary'}>
            {target.status}
          </Badge>
        ),
      },
      {
        header: 'Engagement',
        key: 'engagement',
        render: (target: CampaignTarget) => (
          <div className="flex flex-col text-sm">
            <span>{(target.likes || 0).toLocaleString()} likes</span>
            <span className="text-xs text-foreground/60">
              {(target.retweets || 0).toLocaleString()} RTs
            </span>
          </div>
        ),
      },
      {
        header: 'Reply',
        key: 'reply',
        render: (target: CampaignTarget) =>
          target.replyUrl ? (
            <PrimitiveButton asChild variant={ButtonVariant.LINK}>
              <a
                href={target.replyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Reply
              </a>
            </PrimitiveButton>
          ) : target.errorMessage ? (
            <span className="text-sm text-destructive">
              {target.errorMessage}
            </span>
          ) : (
            '-'
          ),
      },
    ],
    [],
  );

  const dmTargetColumns = useMemo(
    () => [
      {
        header: 'Recipient',
        key: 'recipient',
        render: (target: CampaignTarget) => (
          <span className="font-medium">
            @{target.recipientUsername || target.authorUsername}
          </span>
        ),
      },
      {
        header: 'DM Message',
        key: 'dmText',
        render: (target: CampaignTarget) => (
          <div className="max-w-xs truncate text-sm text-foreground/80">
            {target.dmText || '-'}
          </div>
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (target: CampaignTarget) => (
          <Badge variant={targetStatusVariants[target.status] || 'secondary'}>
            {target.status}
          </Badge>
        ),
      },
      {
        header: 'Sent At',
        key: 'sentAt',
        render: (target: CampaignTarget) => (
          <span className="text-sm">
            {target.dmSentAt ? new Date(target.dmSentAt).toLocaleString() : '-'}
          </span>
        ),
      },
    ],
    [],
  );

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
        <div className="flex items-center gap-4">
          <Button
            label={<HiArrowLeft />}
            variant={ButtonVariant.SECONDARY}
            onClick={() => router.push('/orchestration/outreach-campaigns')}
            size={ButtonSize.SM}
          />
          <div className="flex items-center gap-2">
            {platformIcons[campaign.platform]}
            <Badge variant={getCampaignStatusVariant(campaign.status)}>
              {campaign.status}
            </Badge>
          </div>
        </div>

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

        {campaign.campaignType === CampaignType.DM_OUTREACH ? (
          <div className="border border-white/[0.08] bg-background p-4">
            <h3 className="mb-4 text-lg font-semibold">Add DM Recipients</h3>
            <Textarea
              placeholder="Paste usernames (one per line)&#10;@johndoe&#10;janedoe&#10;@creator123"
              value={urlInput}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setUrlInput(e.target.value)
              }
              rows={4}
            />
            <div className="mt-4 flex justify-end">
              <Button
                label={
                  <>
                    <HiPlus /> Add Recipients
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={handleAddDmRecipients}
                isDisabled={!urlInput.trim() || isAddingUrls}
              />
            </div>
          </div>
        ) : (
          <div className="border border-white/[0.08] bg-background p-4">
            <h3 className="mb-4 text-lg font-semibold">Add Target URLs</h3>
            <Textarea
              placeholder="Paste tweet or Reddit URLs (one per line)&#10;https://twitter.com/user/status/123456789&#10;https://reddit.com/r/subreddit/comments/abc123/title"
              value={urlInput}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setUrlInput(e.target.value)
              }
              rows={4}
            />
            <div className="mt-4 flex justify-end">
              <Button
                label={
                  <>
                    <HiPlus /> Add Targets
                  </>
                }
                variant={ButtonVariant.DEFAULT}
                onClick={handleAddUrls}
                isDisabled={!urlInput.trim() || isAddingUrls}
              />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <h3 className="mb-4 text-lg font-semibold">
            {campaign.campaignType === CampaignType.DM_OUTREACH
              ? 'Recipients'
              : 'Targets'}{' '}
            ({targets.length})
          </h3>
          <AppTable<CampaignTarget>
            items={targets}
            columns={
              campaign.campaignType === CampaignType.DM_OUTREACH
                ? dmTargetColumns
                : targetColumns
            }
            isLoading={isRefreshing}
            getRowKey={(target) => target.id}
            emptyLabel={
              campaign.campaignType === CampaignType.DM_OUTREACH
                ? 'No recipients added yet'
                : 'No targets added yet'
            }
          />
        </div>
      </div>
    </Container>
  );
}
