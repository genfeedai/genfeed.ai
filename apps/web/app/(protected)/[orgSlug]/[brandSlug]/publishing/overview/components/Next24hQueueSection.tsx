import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ConnectedAccountAvatar from '@ui/display/connected-account/ConnectedAccountAvatar';
import { ListRow } from '@ui/lists/list-row/ListRow';
import DateText from '@ui/time/DateText';
import { useTranslations } from 'next-intl';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import type { PublishingOverviewQueueSectionProps } from '@/features/posts/props/publishing-overview.props';

import PublishingOverviewAsyncSection from './PublishingOverviewAsyncSection';

const BUCKET_LABEL_KEYS = {
  later: 'queueBucketLater',
  near: 'queueBucketNear',
} as const;

export default function Next24hQueueSection({
  onRetry,
  state,
}: PublishingOverviewQueueSectionProps) {
  const translate = useTranslations('pages.publishing.overview');
  const { href } = useOrgUrl();

  return (
    <WorkspaceSurface
      data-testid="publishing-overview-next-24h"
      density="compact"
      description={translate('queueDescription')}
      flush
      title={translate('queueTitle')}
    >
      <PublishingOverviewAsyncSection
        errorMessage="Publishing queue could not be loaded."
        loadingLabel="Loading publishing queue"
        onRetry={onRetry}
        state={state}
      >
        {(groups) =>
          groups.some((group) => group.items.length > 0) ? (
            <div className="flex flex-col">
              {groups.map((group) => (
                <div key={group.bucket}>
                  <p className="border-b border-border bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground sm:px-5">
                    {translate(BUCKET_LABEL_KEYS[group.bucket])}
                  </p>
                  <div>
                    {group.items.map((item) => (
                      <ListRow
                        key={item.targetId}
                        density="compact"
                        href={href(item.href)}
                        leading={
                          <ConnectedAccountAvatar
                            account={item.account}
                            size="md"
                          />
                        }
                        title={item.title}
                        meta={item.accountLabel}
                        trailing={
                          <DateText
                            className="text-xs text-muted-foreground"
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
          )
        }
      </PublishingOverviewAsyncSection>
    </WorkspaceSurface>
  );
}
