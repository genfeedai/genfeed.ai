'use client';

import { ReviewDecision } from '@genfeedai/contracts';
import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
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
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Review history</h3>
      <div className="space-y-4">
        {reviewEvents.map((event) => (
          <div
            key={`${event.reviewedAt}-${event.decision}-${event.feedback ?? 'no-feedback'}`}
            className="space-y-2"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium capitalize text-foreground">
                {event.decision === ReviewDecision.REQUEST_CHANGES
                  ? 'Changes requested'
                  : event.decision === ReviewDecision.UNSET
                    ? 'Not reviewed'
                    : event.decision}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateInTimezone(
                  event.reviewedAt,
                  browserTimezone,
                  DATE_FORMATS.DISPLAY_DATETIME,
                )}
              </p>
            </div>
            {event.feedback ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/75">
                {event.feedback}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Avatar className="size-7 bg-background-secondary">
                {event.reviewer?.avatar ? (
                  <AvatarImage
                    alt={`${event.reviewer.displayName} profile picture`}
                    className="object-cover"
                    src={event.reviewer.avatar}
                  />
                ) : null}
                <AvatarFallback className="text-2xs font-semibold text-muted-foreground">
                  {event.reviewer
                    ? getReviewerInitials(event.reviewer.displayName)
                    : '?'}
                </AvatarFallback>
              </Avatar>
              {event.reviewer ? (
                <p className="min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {event.reviewer.displayName}
                  </span>
                  {event.reviewer.handle ? (
                    <span className="ml-1">
                      @{event.reviewer.handle.replace(/^@/, '')}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Reviewer unavailable
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
