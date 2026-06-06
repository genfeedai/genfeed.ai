'use client';

import type { IBatchItem } from '@genfeedai/interfaces';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

interface ReviewPublishOutcomePanelProps {
  browserTimezone: string;
  item: ReviewPanelItem;
}

export default function ReviewPublishOutcomePanel({
  browserTimezone,
  item,
}: ReviewPublishOutcomePanelProps) {
  return (
    <InsetSurface className="p-5" tone="contrast">
      <h3 className="text-sm font-medium text-foreground">Publish Outcome</h3>
      <DefinitionList className="mt-4 text-sm">
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
                  'MMM d, yyyy h:mm a',
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
                  'MMM d, yyyy h:mm a',
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

      <div className="mt-4 border-t border-white/10 pt-4">
        <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
          Performance snapshot
        </h4>
        <DefinitionList className="mt-3 text-sm">
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

      {item.postUrl && (
        <a
          className="mt-4 inline-flex text-sm text-primary underline-offset-2 hover:underline"
          href={item.postUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open published URL
        </a>
      )}
    </InsetSurface>
  );
}
