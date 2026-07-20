'use client';

import type { IBatchItem } from '@genfeedai/interfaces';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';

type ReviewEvent = NonNullable<IBatchItem['reviewEvents']>[number];

interface ReviewHistoryPanelProps {
  browserTimezone: string;
  reviewEvents: ReviewEvent[];
}

function getReviewerInitials(displayName: string): string {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || '?';
}

export default function ReviewHistoryPanel({
  browserTimezone,
  reviewEvents,
}: ReviewHistoryPanelProps) {
  if (reviewEvents.length === 0) {
    return null;
  }

  return (
    <InsetSurface className="p-5" tone="contrast">
      <h3 className="text-sm font-medium text-foreground">Review history</h3>
      <div className="mt-4 space-y-4">
        {reviewEvents.map((event) => (
          <InsetSurface
            key={`${event.reviewedAt}-${event.decision}-${event.feedback ?? 'no-feedback'}`}
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
            <div className="mt-3 flex items-center gap-2">
              <Avatar className="size-7 bg-background shadow-border">
                {event.reviewer?.avatar ? (
                  <AvatarImage
                    alt={`${event.reviewer.displayName} profile picture`}
                    className="object-cover"
                    src={event.reviewer.avatar}
                  />
                ) : null}
                <AvatarFallback className="text-[10px] font-semibold text-foreground/70">
                  {event.reviewer
                    ? getReviewerInitials(event.reviewer.displayName)
                    : '?'}
                </AvatarFallback>
              </Avatar>
              {event.reviewer ? (
                <p className="min-w-0 text-xs text-foreground/55">
                  <span className="font-medium text-foreground/75">
                    {event.reviewer.displayName}
                  </span>
                  {event.reviewer.handle ? (
                    <span className="ml-1">
                      @{event.reviewer.handle.replace(/^@/, '')}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-foreground/45">
                  Reviewer unavailable
                </p>
              )}
            </div>
          </InsetSurface>
        ))}
      </div>
    </InsetSurface>
  );
}
