'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewQueueSectionProps } from '@props/publisher/publishing-overview.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
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
    <WorkspaceSurface
      data-testid="publishing-overview-next-24h"
      density="compact"
      description={translate('queueDescription')}
      flush
      title={translate('queueTitle')}
    >
      {hasItems ? (
        <div className="flex flex-col">
          {groups.map((group) => (
            <div key={group.bucket}>
              <p className="border-b border-border bg-background-secondary/40 px-4 py-2 text-2xs font-bold uppercase tracking-[0.16em] text-muted-foreground sm:px-5">
                {translate(BUCKET_LABEL_KEYS[group.bucket])}
              </p>
              <div>
                {group.items.map((item) => (
                  <ListRow
                    key={item.targetId}
                    density="compact"
                    href={href(item.href)}
                    leading={
                      <PlatformBadge
                        platform={item.platform}
                        showLabel={false}
                      />
                    }
                    title={item.title}
                    meta={item.accountLabel}
                    trailing={
                      <ClientFormattedDate
                        className="text-xs text-muted-foreground"
                        format="dateTime"
                        options={{ hour: '2-digit', minute: '2-digit' }}
                        value={item.scheduledAt}
                      />
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
          {translate('queueEmpty')}
        </p>
      )}
    </WorkspaceSurface>
  );
}
