'use client';

import {
  ButtonVariant,
  CampaignTargetStatus,
  CampaignType,
} from '@genfeedai/enums';
import type { CampaignTarget } from '@services/automation/outreach-campaigns.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import { useMemo } from 'react';

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

type Props = {
  campaignType: CampaignType;
  targets: CampaignTarget[];
  isRefreshing: boolean;
};

export default function OutreachCampaignTargetsTable({
  campaignType,
  targets,
  isRefreshing,
}: Props) {
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

  return (
    <div className="overflow-x-auto">
      <h3 className="mb-4 text-lg font-semibold">
        {campaignType === CampaignType.DM_OUTREACH ? 'Recipients' : 'Targets'} (
        {targets.length})
      </h3>
      <AppTable<CampaignTarget>
        items={targets}
        columns={
          campaignType === CampaignType.DM_OUTREACH
            ? dmTargetColumns
            : targetColumns
        }
        isLoading={isRefreshing}
        getRowKey={(target) => target.id}
        emptyLabel={
          campaignType === CampaignType.DM_OUTREACH
            ? 'No recipients added yet'
            : 'No targets added yet'
        }
      />
    </div>
  );
}
