'use client';

import { ButtonSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewCadenceSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function CadenceGapsSection({
  gaps,
}: PublishingOverviewCadenceSectionProps) {
  const translate = useTranslations('pages.publishing.overview');
  const { href } = useOrgUrl();

  return (
    <Card
      bodyClassName="flex flex-col gap-4 p-5"
      data-testid="publishing-overview-cadence"
      description={translate('cadenceDescription')}
      label={translate('cadenceTitle')}
    >
      {gaps.length > 0 ? (
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
                  <span className="min-w-0 truncate">{gap.accountLabel}</span>
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
                    <Badge variant="warning">{translate('cadenceHold')}</Badge>
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
        <p className="text-sm text-muted-foreground">
          {translate('cadenceEmpty')}
        </p>
      )}
    </Card>
  );
}
