'use client';

import type { IBatchItem } from '@genfeedai/interfaces';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';

type ReviewEvent = NonNullable<IBatchItem['reviewEvents']>[number];

interface ReviewHistoryPanelProps {
  browserTimezone: string;
  reviewEvents: ReviewEvent[];
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
          </InsetSurface>
        ))}
      </div>
    </InsetSurface>
  );
}
