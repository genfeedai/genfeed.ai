'use client';

import type { IBatchItem } from '@genfeedai/interfaces';
import {
  BatchItemStatus,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import {
  isApproved,
  isChangesRequested,
  isReadyToReview,
} from '@pages/review/components/review-state';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  HiCheck,
  HiCursorArrowRays,
  HiOutlineClock,
  HiOutlineLightBulb,
  HiPhoto,
  HiSparkles,
  HiXMark,
} from 'react-icons/hi2';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

interface ReviewDetailPanelProps {
  isActioning: boolean;
  isSelected: boolean;
  item: ReviewPanelItem | null;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
}

function buildStatusLabel(item: ReviewPanelItem): string {
  if (isApproved(item)) {
    return 'Approved';
  }

  if (isChangesRequested(item)) {
    return 'Changes requested';
  }

  if (item.reviewDecision === 'rejected') {
    return 'Rejected';
  }

  switch (item.status) {
    case BatchItemStatus.COMPLETED:
      return 'Ready to review';
    case BatchItemStatus.FAILED:
      return 'Generation failed';
    case BatchItemStatus.GENERATING:
      return 'Generating';
    case BatchItemStatus.PENDING:
      return 'Pending';
    case BatchItemStatus.SKIPPED:
      return 'Rejected';
    default:
      return item.status;
  }
}

function getApproveLabel(item: ReviewPanelItem): string {
  if (item.postId && !item.scheduledDate) {
    return 'Approve and open draft';
  }

  return 'Approve and schedule';
}

export default function ReviewDetailPanel({
  isActioning,
  isSelected,
  item,
  onApprove,
  onRequestChanges,
  onReject,
  onToggleSelect,
}: ReviewDetailPanelProps) {
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setFeedback(item?.reviewFeedback ?? '');
  }, [item?.id, item?.reviewFeedback]);

  if (!item) {
    return (
      <InsetSurface className="flex min-h-[720px] flex-col items-center justify-center p-8 text-center">
        <div className="rounded-full border border-white/10 bg-white/[0.03] p-5">
          <HiCursorArrowRays className="h-8 w-8 text-foreground/50" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">
          Select an item to review
        </h2>
        <p className="mt-2 max-w-md text-sm text-foreground/55">
          Pick a post from the queue to inspect the creative, caption, prompt,
          and scheduling details before you approve or reject it.
        </p>
      </InsetSurface>
    );
  }

  const formattedScheduledDate = item.scheduledDate
    ? formatDateInTimezone(
        item.scheduledDate,
        browserTimezone,
        'MMM d, yyyy h:mm a',
      )
    : null;
  const formattedCreatedDate = formatDateInTimezone(
    item.createdAt,
    browserTimezone,
    'MMM d, yyyy h:mm a',
  );
  const isReady = isReadyToReview(item);
  const statusLabel = buildStatusLabel(item);
  const reviewEvents = [...(item.reviewEvents ?? [])].sort((left, right) =>
    right.reviewedAt.localeCompare(left.reviewedAt),
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-foreground/45">
            Review Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">
            {statusLabel}
          </h2>
          <p className="mt-1 text-sm text-foreground/55">
            Review the post preview, then make a clear keep, revise, or skip
            decision.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {item.platform && (
            <PlatformBadge platform={item.platform} size={ComponentSize.MD} />
          )}
          <Badge
            status={isApproved(item) ? 'completed' : item.status}
            size={ComponentSize.MD}
          >
            {statusLabel}
          </Badge>
          <Badge status={item.format} size={ComponentSize.MD} />
        </div>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1.5fr),minmax(320px,1fr)]">
        <div className="space-y-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950">
            {item.mediaUrl ? (
              <Image
                src={item.mediaUrl}
                alt={item.caption ?? 'Review item preview'}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 60vw"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-foreground/45">
                <div className="rounded-full border border-white/10 bg-white/[0.03] p-4">
                  <HiPhoto className="h-8 w-8" />
                </div>
                <p className="text-sm">No media preview generated yet</p>
              </div>
            )}
          </div>

          <InsetSurface className="p-5" tone="contrast">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HiSparkles className="h-4 w-4 text-foreground/55" />
              Caption
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/85">
              {item.caption ?? 'No caption generated for this item yet.'}
            </p>
          </InsetSurface>

          <InsetSurface className="p-5" tone="contrast">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HiOutlineClock className="h-4 w-4 text-foreground/55" />
              Prompt
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/70">
              {item.prompt ?? 'No generation prompt saved for this item.'}
            </p>
          </InsetSurface>
        </div>

        <aside className="space-y-4">
          <InsetSurface className="p-5" tone="contrast">
            <h3 className="text-sm font-medium text-foreground">Decision</h3>
            <p className="mt-1 text-sm text-foreground/55">
              Keep momentum by making the decision from this panel.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
                  Reviewer notes
                </span>
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Add revision guidance or rejection context"
                  className="min-h-28 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground/35 focus:border-white/20"
                />
              </label>

              {isReady ? (
                <>
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    isDisabled={isActioning}
                    onClick={() => onApprove(item.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <HiCheck className="h-4 w-4" />
                    {getApproveLabel(item)}
                  </Button>
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    isDisabled={isActioning}
                    onClick={() => onRequestChanges(item.id, feedback)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                  >
                    <HiSparkles className="h-4 w-4" />
                    Request changes
                  </Button>
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    isDisabled={isActioning}
                    onClick={() => onReject(item.id, feedback)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/15 px-4 py-3 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    <HiXMark className="h-4 w-4" />
                    Reject and remove
                  </Button>
                </>
              ) : (
                <InsetSurface
                  className="px-4 py-3 text-sm text-foreground/55"
                  density="compact"
                >
                  {isApproved(item)
                    ? 'This item has already been approved.'
                    : isChangesRequested(item)
                      ? 'Changes were requested for this item.'
                      : item.reviewDecision === 'rejected'
                        ? 'This item was rejected.'
                        : 'This item is not currently actionable.'}
                </InsetSurface>
              )}

              {isReadyToReview(item) && (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => onToggleSelect(item.id)}
                  className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm font-medium text-foreground/75 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                >
                  {isSelected
                    ? 'Remove from bulk selection'
                    : 'Add to bulk selection'}
                </Button>
              )}
            </div>
          </InsetSurface>

          <InsetSurface className="p-5" tone="contrast">
            <h3 className="text-sm font-medium text-foreground">Details</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Created</dt>
                <dd className="text-right text-foreground/80">
                  {formattedCreatedDate}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Scheduled</dt>
                <dd className="text-right text-foreground/80">
                  {formattedScheduledDate ?? 'Not scheduled'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Post draft</dt>
                <dd className="text-right text-foreground/80">
                  {item.postId ? 'Draft linked' : 'No draft linked'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Review state</dt>
                <dd className="text-right text-foreground/80">{statusLabel}</dd>
              </div>
            </dl>
          </InsetSurface>

          <InsetSurface className="p-5" tone="contrast">
            <h3 className="text-sm font-medium text-foreground">Lineage</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Topic</dt>
                <dd className="text-right text-foreground/80">
                  {item.opportunityTopic ?? 'Not recorded'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Source type</dt>
                <dd className="text-right capitalize text-foreground/80">
                  {item.opportunitySourceType ?? 'Not recorded'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Workflow</dt>
                <dd className="text-right text-foreground/80">
                  {item.sourceWorkflowName ??
                    item.sourceWorkflowId ??
                    'Not recorded'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Action</dt>
                <dd className="text-right text-foreground/80">
                  {item.sourceActionId ?? 'Not recorded'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Generation</dt>
                <dd className="text-right text-foreground/80">
                  {item.postGenerationId ?? 'Not linked'}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              {item.sourceWorkflowId && (
                <Link
                  className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-foreground/75 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  href={
                    item.sourceActionId
                      ? `/orchestration/${item.sourceWorkflowId}?opportunity=${item.sourceActionId}`
                      : `/orchestration/${item.sourceWorkflowId}`
                  }
                >
                  Open strategy
                </Link>
              )}
              {item.postId && (
                <Link
                  className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-foreground/75 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  href={`/posts/${item.postId}`}
                >
                  Open draft
                </Link>
              )}
              {item.postUrl && (
                <a
                  className="inline-flex rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-foreground/75 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                  href={item.postUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open published URL
                </a>
              )}
            </div>
          </InsetSurface>

          {(item.gateOverallScore !== undefined ||
            (item.gateReasons?.length ?? 0) > 0) && (
            <InsetSurface className="p-5" tone="contrast">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <HiOutlineLightBulb className="h-4 w-4 text-foreground/55" />
                Publish Gate
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-foreground/45">Overall score</dt>
                  <dd className="text-right text-foreground/80">
                    {item.gateOverallScore !== undefined
                      ? `${item.gateOverallScore}/100`
                      : 'Not recorded'}
                  </dd>
                </div>
              </dl>

              {(item.gateReasons?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
                    Why it passed
                  </h4>
                  <ul className="mt-3 space-y-2 text-sm text-foreground/75">
                    {item.gateReasons?.map((reason, index) => (
                      <li
                        key={`${reason}-${index}`}
                        className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </InsetSurface>
          )}

          <InsetSurface className="p-5" tone="contrast">
            <h3 className="text-sm font-medium text-foreground">
              Publish Outcome
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Post status</dt>
                <dd className="text-right text-foreground/80">
                  {item.postStatus ?? 'Not linked'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">External ID</dt>
                <dd className="text-right text-foreground/80">
                  {item.postExternalId ?? 'Not published'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Published</dt>
                <dd className="text-right text-foreground/80">
                  {item.postPublishedAt
                    ? formatDateInTimezone(
                        item.postPublishedAt,
                        browserTimezone,
                        'MMM d, yyyy h:mm a',
                      )
                    : 'Not published'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Last attempt</dt>
                <dd className="text-right text-foreground/80">
                  {item.postLastAttemptAt
                    ? formatDateInTimezone(
                        item.postLastAttemptAt,
                        browserTimezone,
                        'MMM d, yyyy h:mm a',
                      )
                    : 'No attempts recorded'}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-foreground/45">Retry count</dt>
                <dd className="text-right text-foreground/80">
                  {item.postRetryCount ?? 0}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-white/10 pt-4">
              <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
                Performance snapshot
              </h4>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-foreground/45">Views</dt>
                  <dd className="text-right text-foreground/80">
                    {item.postTotalViews ?? 0}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-foreground/45">Likes</dt>
                  <dd className="text-right text-foreground/80">
                    {item.postTotalLikes ?? 0}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-foreground/45">Comments</dt>
                  <dd className="text-right text-foreground/80">
                    {item.postTotalComments ?? 0}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-foreground/45">Shares</dt>
                  <dd className="text-right text-foreground/80">
                    {item.postTotalShares ?? 0}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-foreground/45">Engagement</dt>
                  <dd className="text-right text-foreground/80">
                    {item.postAvgEngagementRate !== undefined
                      ? `${item.postAvgEngagementRate.toFixed(1)}%`
                      : 'Not synced'}
                  </dd>
                </div>
              </dl>
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

          {reviewEvents.length > 0 && (
            <InsetSurface className="p-5" tone="contrast">
              <h3 className="text-sm font-medium text-foreground">
                Review history
              </h3>
              <div className="mt-4 space-y-4">
                {reviewEvents.map((event, index) => (
                  <InsetSurface
                    key={`${event.reviewedAt}-${event.decision}-${index}`}
                    tone="default"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm font-medium capitalize text-foreground">
                        {event.decision === 'request_changes'
                          ? 'Changes requested'
                          : event.decision}
                      </p>
                      <p className="text-xs text-foreground/45">
                        {formatDateInTimezone(
                          event.reviewedAt,
                          browserTimezone,
                          'MMM d, yyyy h:mm a',
                        )}
                      </p>
                    </div>
                    {event.feedback && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/75">
                        {event.feedback}
                      </p>
                    )}
                  </InsetSurface>
                ))}
              </div>
            </InsetSurface>
          )}

          {item.reviewFeedback && (
            <InsetSurface className="p-5" tone="contrast">
              <h3 className="text-sm font-medium text-foreground">
                Saved reviewer notes
              </h3>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/75">
                {item.reviewFeedback}
              </p>
            </InsetSurface>
          )}

          {item.status === BatchItemStatus.FAILED && item.error && (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
              <h3 className="text-sm font-medium text-rose-200">
                Failure reason
              </h3>
              <p className="mt-2 text-sm leading-6 text-rose-100/85">
                {item.error}
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
