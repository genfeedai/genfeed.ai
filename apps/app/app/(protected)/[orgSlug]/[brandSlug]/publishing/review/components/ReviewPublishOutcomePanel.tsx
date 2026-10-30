import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useTranslations } from 'next-intl';
import type { ReviewPublishOutcomePanelProps } from '@/features/posts/props/review-publish-outcome-panel.props';

export default function ReviewPublishOutcomePanel({
  browserTimezone,
  item,
}: ReviewPublishOutcomePanelProps) {
  const translate = useTranslations('pages.publishing.review');
  return (
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">
        {translate('outcome.title')}
      </h3>
      <DefinitionList className="text-sm">
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('outcome.status')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postStatus ?? translate('outcome.notLinked')}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('outcome.externalId')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postExternalId ?? translate('outcome.notPublished')}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('outcome.published')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postPublishedAt
              ? formatDateInTimezone(
                  item.postPublishedAt,
                  browserTimezone,
                  DATE_FORMATS.DISPLAY_DATETIME,
                )
              : translate('outcome.notPublished')}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('outcome.lastAttempt')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postLastAttemptAt
              ? formatDateInTimezone(
                  item.postLastAttemptAt,
                  browserTimezone,
                  DATE_FORMATS.DISPLAY_DATETIME,
                )
              : translate('outcome.noAttempts')}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('outcome.retryCount')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postRetryCount ?? 0}
          </DefinitionDetail>
        </div>
      </DefinitionList>

      <div className="space-y-3 pt-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {translate('outcome.performance')}
        </p>
        <DefinitionList className="text-sm">
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('outcome.views')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalViews ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('outcome.likes')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalLikes ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('outcome.comments')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalComments ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('outcome.shares')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postTotalShares ?? 0}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('outcome.engagement')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postAvgEngagementRate !== undefined
                ? `${item.postAvgEngagementRate.toFixed(1)}%`
                : translate('outcome.notSynced')}
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
          {translate('table.openPublished')}
        </a>
      ) : null}
    </div>
  );
}
