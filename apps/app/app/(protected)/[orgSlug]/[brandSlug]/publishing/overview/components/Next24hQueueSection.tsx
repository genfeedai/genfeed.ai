'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewQueueSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { ListRow } from '@ui/lists/list-row/ListRow';
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
        <p className="text-sm text-muted-foreground">
          {translate('queueEmpty')}
        </p>
      )}
    </Card>
  );
}
