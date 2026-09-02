'use client';

import { ButtonSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewCadenceSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
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
        <ul className="flex flex-col gap-2">
          {gaps.map((gap) => (
            <li
              key={gap.credentialId}
              className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3">
                <PlatformBadge platform={gap.platform} showLabel={false} />
                <span className="min-w-0 truncate text-sm font-medium">
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
                  <Badge variant="warning">{translate('cadenceHold')}</Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {gap.gapDays === null
                    ? translate('cadenceNeverPublished')
                    : translate('cadenceGapDays', { count: gap.gapDays })}
                </span>
                {gap.needsReconnect ? (
                  <Button asChild size={ButtonSize.SM} withWrapper={false}>
                    <Link href={href(APP_ROUTES.SETTINGS.SOCIAL)}>
                      {translate('cadenceReconnectAction')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('cadenceEmpty')}
        </p>
      )}
    </Card>
  );
}
