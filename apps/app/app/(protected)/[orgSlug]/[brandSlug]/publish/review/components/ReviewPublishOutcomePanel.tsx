'use client';

import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';

import type { ReviewPanelItem } from './review-panel.types';

interface ReviewPublishOutcomePanelProps {
  browserTimezone: string;
  item: ReviewPanelItem;
}

export default function ReviewPublishOutcomePanel({
  browserTimezone,
  item,
}: ReviewPublishOutcomePanelProps) {
  return (
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Publish outcome</h3>
      <DefinitionList className="text-sm">
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Post status</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postStatus ?? 'Not linked'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>External ID</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postExternalId ?? 'Not published'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Published</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postPublishedAt
              ? formatDateInTimezone(
                  item.postPublishedAt,
                  browserTimezone,
                  DATE_FORMATS.DISPLAY_DATETIME,
                )
              : 'Not published'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Last attempt</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postLastAttemptAt
              ? formatDateInTimezone(
                  item.postLastAttemptAt,
                  browserTimezone,
                  DATE_FORMATS.DISPLAY_DATETIME,
                )
              : 'No attempts recorded'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Retry count</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postRetryCount ?? 0}
          </DefinitionDetail>
        </div>
      </DefinitionList>

      <div className="space-y-3 pt-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Performance snapshot
        </p>
        <DefinitionList className="text-sm">
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Views</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalViews ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Likes</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalLikes ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Comments</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalComments ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Shares</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalShares ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Engagement</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postAvgEngagementRate !== undefined
                ? `${item.postAvgEngagementRate.toFixed(1)}%`
                : 'Not synced'}
            </DefinitionDetail>
          </div>
        </DefinitionList>
      </div>

      {item.postUrl ? (
        <a
          className="inline-flex text-sm text-primary underline-offset-2 hover:underline"
          href={item.postUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open published URL
        </a>
      ) : null}
    </div>
  );
}
