'use client';

import { ButtonSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewCadenceSectionProps } from '@props/publisher/publishing-overview.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import PublishingOverviewAsyncSection from './PublishingOverviewAsyncSection';

export default function CadenceGapsSection({
  onRetry,
  state,
}: PublishingOverviewCadenceSectionProps) {
  const translate = useTranslations('pages.publishing.overview');
  const { href } = useOrgUrl();

  return (
    <WorkspaceSurface
      data-testid="publishing-overview-cadence"
      density="compact"
      description={translate('cadenceDescription')}
      flush
      title={translate('cadenceTitle')}
    >
      <PublishingOverviewAsyncSection
        errorMessage="Publishing cadence could not be loaded."
        loadingLabel="Loading publishing cadence"
        onRetry={onRetry}
        state={state}
      >
        {(gaps) =>
          gaps.length > 0 ? (
            <div>
              {gaps.map((gap) => (
                <ListRow
                  key={gap.credentialId}
                  density="compact"
                  leading={
                    <PlatformBadge platform={gap.platform} showLabel={false} />
                  }
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate">
                        {gap.accountLabel}
                      </span>
                      {gap.hasUpcoming ? (
                        <Badge variant="success">
                          {translate('cadenceScheduled')}
                        </Badge>
                      ) : null}
                      {gap.needsReconnect ? (
                        <Badge variant="destructive">
                          {translate('cadenceReconnect')}
                        </Badge>
                      ) : gap.holdPublishing ? (
                        <Badge variant="warning">
                          {translate('cadenceHold')}
                        </Badge>
                      ) : null}
                    </span>
                  }
                  meta={
                    gap.gapDays === null
                      ? translate('cadenceNeverPublished')
                      : translate('cadenceGapDays', { count: gap.gapDays })
                  }
                  trailing={
                    gap.needsReconnect ? (
                      <Button asChild size={ButtonSize.SM} withWrapper={false}>
                        <Link href={href(APP_ROUTES.SETTINGS.SOCIAL)}>
                          {translate('cadenceReconnectAction')}
                        </Link>
                      </Button>
                    ) : null
                  }
                />
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
              {translate('cadenceEmpty')}
            </p>
          )
        }
      </PublishingOverviewAsyncSection>
    </WorkspaceSurface>
  );
}
