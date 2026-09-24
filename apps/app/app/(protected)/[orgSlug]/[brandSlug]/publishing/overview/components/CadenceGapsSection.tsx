import type { PublishingOverviewCadenceSectionProps } from '@props/publisher/publishing-overview.props';
import Badge from '@ui/display/badge/Badge';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { useTranslations } from 'next-intl';
import PublishingAccountRow from './PublishingAccountRow';
import PublishingOverviewAsyncSection from './PublishingOverviewAsyncSection';

export default function CadenceGapsSection({
  connections = [],
  onRetry,
  state,
}: PublishingOverviewCadenceSectionProps) {
  const translate = useTranslations('pages.publishing.overview');

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
            <ul aria-label={translate('cadenceTitle')}>
              {gaps.map((gap) => (
                <PublishingAccountRow
                  key={gap.credentialId}
                  accountLabel={gap.accountLabel}
                  connections={connections}
                  credentialId={gap.credentialId}
                  platform={gap.platform}
                  reconnectLabel={
                    gap.needsReconnect
                      ? translate('cadenceReconnectAction')
                      : undefined
                  }
                  meta={
                    gap.gapDays === null
                      ? translate('cadenceNeverPublished')
                      : translate('cadenceGapDays', { count: gap.gapDays })
                  }
                >
                  {gap.hasUpcoming ? (
                    <Badge variant="success">
                      {translate('cadenceScheduled')}
                    </Badge>
                  ) : null}
                  {gap.needsReconnect ? (
                    <Badge variant="warning">
                      {translate('cadenceReconnect')}
                    </Badge>
                  ) : null}
                  {gap.holdPublishing ? (
                    <Badge variant="warning">{translate('cadenceHold')}</Badge>
                  ) : null}
                </PublishingAccountRow>
              ))}
            </ul>
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
