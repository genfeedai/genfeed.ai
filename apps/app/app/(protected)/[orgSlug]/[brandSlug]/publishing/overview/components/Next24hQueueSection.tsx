'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewQueueSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';

const BUCKET_LABEL_KEYS = {
  later: 'queueBucketLater',
  near: 'queueBucketNear',
} as const;

export default function Next24hQueueSection({
  groups,
}: PublishingOverviewQueueSectionProps) {
  const translate = useTranslations('pages.publishing.overview');
  const { href } = useOrgUrl();
  const hasItems = groups.some((group) => group.items.length > 0);

  return (
    <Card
      bodyClassName="flex flex-col gap-4 p-5"
      data-testid="publishing-overview-next-24h"
      description={translate('queueDescription')}
      label={translate('queueTitle')}
    >
      {hasItems ? (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.bucket} className="space-y-2">
              <p className="text-2xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {translate(BUCKET_LABEL_KEYS[group.bucket])}
              </p>
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <li key={item.targetId}>
                    <Link
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:border-border-strong"
                      href={href(item.href)}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <PlatformBadge
                          platform={item.platform}
                          showLabel={false}
                        />
                        <span className="min-w-0 truncate font-medium">
                          {item.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.accountLabel}
                        </span>
                      </span>
                      <ClientFormattedDate
                        className="shrink-0 text-xs text-muted-foreground"
                        format="dateTime"
                        options={{ hour: '2-digit', minute: '2-digit' }}
                        value={item.scheduledAt}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('queueEmpty')}
        </p>
      )}
    </Card>
  );
}
