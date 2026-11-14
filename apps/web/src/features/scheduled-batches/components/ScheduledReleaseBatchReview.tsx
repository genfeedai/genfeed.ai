'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonVariant, CardPadding, CardVariant } from '@genfeedai/contracts';
import type {
  IScheduledReleaseBatchPost,
  IScheduledReleaseBatchReview,
} from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { EmptyState } from '@ui/primitives/empty-state';
import { Progress } from '@ui/primitives/progress';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import { Check, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ScheduledReleaseBatchReviewState } from '../hooks/use-scheduled-release-batch-review';
import {
  formatBatchPostTime,
  getKeptBatchPosts,
  groupBatchPostsByDay,
  UNSCHEDULED_DAY_KEY,
} from '../scheduled-release-batch.helpers';
import ScheduledReleaseBatchPostRow from './ScheduledReleaseBatchPostRow';

const STATUS_BADGES = {
  declined: { messageKey: 'statusDeclined', status: 'rejected' },
  expired: { messageKey: 'statusExpired', status: 'expired' },
  partially_scheduled: {
    messageKey: 'statusPartial',
    status: 'needs_attention',
  },
  pending: { messageKey: 'statusPending', status: 'pending_approval' },
  scheduled: { messageKey: 'statusScheduled', status: 'scheduled' },
  scheduling: { messageKey: 'statusScheduling', status: 'pending_approval' },
} as const;

interface ScheduledReleaseBatchReviewProps {
  batch: ScheduledReleaseBatchReviewState;
  review: IScheduledReleaseBatchReview;
}

function countFailed(posts: readonly IScheduledReleaseBatchPost[]): number {
  return posts.filter((post) => post.error).length;
}

/**
 * Every post of a week an MCP client asked to schedule, read in full before one
 * approval. The reviewer can remove single posts; approving makes the server
 * schedule the rest, so the agent never has to call again (#10134).
 */
export default function ScheduledReleaseBatchReview({
  batch,
  review,
}: ScheduledReleaseBatchReviewProps) {
  const translate = useTranslations('pages.publishing.batch');
  const locale = useLocale();
  const { openConfirm } = useConfirmModal();
  const { posts, status } = review;
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [dayKey, setDayKey] = useState('all');

  const isPending = status === 'pending';
  const isLocked = !isPending || batch.isDeciding;
  const removedIndexes = useMemo(
    () =>
      isPending
        ? removed
        : new Set(posts.filter((post) => post.isRemoved).map((p) => p.index)),
    [isPending, posts, removed],
  );
  const kept = useMemo(
    () => getKeptBatchPosts(posts, removedIndexes),
    [posts, removedIndexes],
  );
  const days = useMemo(() => groupBatchPostsByDay(posts), [posts]);
  const visibleDays =
    dayKey === 'all' ? days : days.filter((d) => d.key === dayKey);
  const scheduledCount = posts.filter((post) => post.releaseId).length;
  const failedCount = countFailed(posts);
  const badge = STATUS_BADGES[status];
  const firstKept = kept.find((post) => post.scheduledAt);

  const toggle = useCallback((index: number) => {
    setRemoved((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const dayLabel = useCallback(
    (key: string, dayPosts: readonly IScheduledReleaseBatchPost[]) =>
      key === UNSCHEDULED_DAY_KEY
        ? translate('unscheduled')
        : formatBatchPostTime(dayPosts[0], locale, {
            day: 'numeric',
            month: 'long',
            weekday: 'long',
          }),
    [locale, translate],
  );

  const handleApprove = useCallback(() => {
    openConfirm({
      confirmLabel: translate('confirmLabel', { count: kept.length }),
      label: translate('confirmTitle', { count: kept.length }),
      message: translate('confirmMessage', {
        removed: removed.size,
        start: firstKept
          ? formatBatchPostTime(firstKept, locale, {
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              month: 'short',
              weekday: 'short',
            })
          : '',
      }),
      onConfirm: async () => {
        await batch.approve([...removed]);
      },
    });
  }, [batch, firstKept, kept.length, locale, openConfirm, removed, translate]);

  const handleDecline = useCallback(() => {
    openConfirm({
      confirmLabel: translate('decline'),
      isError: true,
      label: translate('declineTitle'),
      message: translate('declineMessage'),
      onConfirm: async () => {
        await batch.decline();
      },
    });
  }, [batch, openConfirm, translate]);

  const first = posts[0];
  const times = posts.flatMap((post) => (post.scheduledAt ? [post] : []));
  const windowLabel =
    times.length > 1
      ? translate('window', {
          end: formatBatchPostTime(times[times.length - 1], locale, {
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
          }),
          start: formatBatchPostTime(times[0], locale, {
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
          }),
        })
      : times[0]
        ? formatBatchPostTime(times[0], locale, {
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            month: 'short',
          })
        : '';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <Card
        description={
          review.requestedByLabel
            ? translate('requestedBy', { name: review.requestedByLabel })
            : translate('requestedByMcp')
        }
        headerAction={
          <Badge status={badge.status}>{translate(badge.messageKey)}</Badge>
        }
        isHeaderInside
        isLabelWrapped
        label={translate('title', { count: posts.length })}
        labelAs="h1"
        variant={CardVariant.BORDERED}
      >
        <DefinitionList
          className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
          variant="compact"
        >
          <div>
            <DefinitionTerm>{translate('factPosts')}</DefinitionTerm>
            <DefinitionDetail>
              {windowLabel
                ? `${posts.length} · ${windowLabel}`
                : String(posts.length)}
            </DefinitionDetail>
          </div>
          <div>
            <DefinitionTerm>{translate('factAccount')}</DefinitionTerm>
            <DefinitionDetail>
              {first?.accountLabel ?? first?.accountHandle ?? '–'}
            </DefinitionDetail>
          </div>
          <div>
            <DefinitionTerm>{translate('factBrand')}</DefinitionTerm>
            <DefinitionDetail>{review.brandLabel ?? '–'}</DefinitionDetail>
          </div>
          <div>
            <DefinitionTerm>{translate('factCost')}</DefinitionTerm>
            <DefinitionDetail>{translate('noCost')}</DefinitionDetail>
          </div>
          {review.expiresAt ? (
            <div>
              <DefinitionTerm>{translate('factExpires')}</DefinitionTerm>
              <DefinitionDetail>
                <ClientFormattedDate
                  format="relative"
                  value={review.expiresAt}
                />
              </DefinitionDetail>
            </div>
          ) : null}
        </DefinitionList>
      </Card>

      {status === 'expired' ? (
        <Alert variant="warning">
          <div className="space-y-1">
            <div className="font-medium">{translate('expiredTitle')}</div>
            <div className="text-xs text-foreground/70">
              {translate('expiredMessage')}
            </div>
          </div>
        </Alert>
      ) : null}

      {status === 'declined' ? (
        <Alert variant="note">
          <div className="font-medium">{translate('declinedTitle')}</div>
        </Alert>
      ) : null}

      {batch.isDeciding || status === 'scheduling' ? (
        <Card padding={CardPadding.MD} variant={CardVariant.BORDERED}>
          <div className="flex flex-col gap-2" role="status">
            <span className="text-sm font-medium text-foreground">
              {translate('schedulingStatus', { count: kept.length })}
            </span>
            <Progress isIndeterminate />
            <span className="text-xs text-muted-foreground">
              {translate('schedulingHint')}
            </span>
          </div>
        </Card>
      ) : null}

      {status === 'scheduled' || status === 'partially_scheduled' ? (
        <Alert variant={failedCount ? 'warning' : 'success'}>
          <div className="space-y-1">
            <div className="font-medium">
              {translate(failedCount ? 'doneTitlePartial' : 'doneTitle', {
                failed: failedCount,
                scheduled: scheduledCount,
              })}
            </div>
            <div className="text-xs text-foreground/70">
              {translate(failedCount ? 'doneHintPartial' : 'doneHint')}
            </div>
          </div>
        </Alert>
      ) : null}

      {isPending && !batch.isDeciding ? (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background/90 px-1 py-2 backdrop-blur">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {translate('barSummary', {
                kept: kept.length,
                total: posts.length,
              })}
            </span>
            <span className="text-xs text-muted-foreground">
              {kept.length === 0
                ? translate('barAllRemoved')
                : removed.size > 0
                  ? translate('barRemoved', { count: removed.size })
                  : translate('barHint')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              isDisabled={batch.isDeciding}
              onClick={handleDecline}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              {translate('decline')}
            </Button>
            <Button
              icon={<Check aria-hidden="true" />}
              isDisabled={kept.length === 0 || batch.isDeciding}
              onClick={handleApprove}
              withWrapper={false}
            >
              {translate('approve', { count: kept.length })}
            </Button>
          </div>
        </div>
      ) : null}

      {days.length > 1 ? (
        <SegmentedControl
          ariaLabel={translate('dayFilter')}
          onValueChange={setDayKey}
          options={[
            {
              label: translate('dayAll', { count: posts.length }),
              value: 'all',
            },
            ...days.map((day) => ({
              label: dayLabel(day.key, day.posts).slice(0, 3),
              tooltip: `${dayLabel(day.key, day.posts)}, ${translate('dayCount', { count: day.posts.length })}`,
              value: day.key,
            })),
          ]}
          value={dayKey}
        />
      ) : null}

      {visibleDays.map((day) => (
        <CollectionSection
          description={translate('dayCount', { count: day.posts.length })}
          itemCount={day.posts.length}
          key={day.key}
          title={dayLabel(day.key, day.posts)}
        >
          <ul className="flex flex-col gap-3">
            {day.posts.map((post) => (
              <ScheduledReleaseBatchPostRow
                isLocked={isLocked}
                isRemoved={removedIndexes.has(post.index)}
                key={post.index}
                onToggle={() => toggle(post.index)}
                post={post}
              />
            ))}
          </ul>
        </CollectionSection>
      ))}

      {posts.length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          surface="card"
          title={translate('noPosts')}
        />
      ) : null}
    </div>
  );
}
