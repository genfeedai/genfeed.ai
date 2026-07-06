'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IAnnouncement } from '@genfeedai/interfaces';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { HiCalendar } from 'react-icons/hi2';

const ANNOUNCEMENT_HISTORY_SKELETON_KEYS = [
  'announcement-history-skeleton-1',
  'announcement-history-skeleton-2',
  'announcement-history-skeleton-3',
] as const;

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

type Props = {
  isLoadingHistory: boolean;
  announcements: IAnnouncement[];
};

export default function AnnouncementHistoryList({
  isLoadingHistory,
  announcements,
}: Props) {
  return (
    <div className="space-y-3">
      {isLoadingHistory ? (
        ANNOUNCEMENT_HISTORY_SKELETON_KEYS.map((key) => (
          <SkeletonCard key={key} showImage={false} />
        ))
      ) : announcements.length === 0 ? (
        <CardEmpty label="No announcements yet" />
      ) : (
        announcements.map((announcement) => (
          <div
            key={announcement.id}
            className="shadow-border bg-card p-4 space-y-3"
          >
            {/* Body preview */}
            <p className="text-sm text-foreground leading-relaxed">
              {truncate(announcement.body, 100)}
            </p>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2">
              {announcement.channels.discord && (
                <Badge variant="blue">Discord</Badge>
              )}
              {announcement.channels.twitter && (
                <Badge variant="outline">Twitter/X</Badge>
              )}

              <span className="flex items-center gap-1 text-xs text-foreground/50 ml-auto">
                <HiCalendar className="size-3.5" />
                {formatDate(announcement.publishedAt ?? announcement.createdAt)}
              </span>
            </div>

            {/* Links row */}
            {(announcement.discordMessageUrl || announcement.tweetUrl) && (
              <div className="flex items-center gap-3 pt-1 border-t border-border">
                {announcement.discordMessageUrl && (
                  <Button asChild variant={ButtonVariant.GHOST}>
                    <a
                      href={announcement.discordMessageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on Discord
                    </a>
                  </Button>
                )}
                {announcement.tweetUrl && (
                  <Button asChild variant={ButtonVariant.GHOST}>
                    <a
                      href={announcement.tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View Tweet
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
