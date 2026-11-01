import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { Avatar } from '@ui/primitives/avatar';
import { useTranslations } from 'next-intl';
import type { ReviewHistoryPanelProps } from '@/features/posts/props/review-history-panel.props';

export default function ReviewHistoryPanel({
  browserTimezone,
  reviewEvents,
}: ReviewHistoryPanelProps) {
  const translate = useTranslations('pages.publishing.review');
  if (reviewEvents.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">
        {translate('history.title')}
      </h3>
      <div className="space-y-4">
        {reviewEvents.map((event) => (
          <div
            key={`${event.reviewedAt}-${event.decision}-${event.feedback ?? 'no-feedback'}`}
            className="space-y-2"
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-medium capitalize text-foreground">
                {translate(`history.decisions.${event.decision}`)}
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
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">
                {event.feedback}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <Avatar
                alt={
                  event.reviewer
                    ? translate('history.avatarAlt', {
                        name: event.reviewer.displayName,
                      })
                    : undefined
                }
                name={event.reviewer?.displayName}
                size="md"
                src={event.reviewer?.avatar}
              />
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
                  {translate('history.unavailable')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
