'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize } from '@genfeedai/enums';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { PublishingOverviewHealthSectionProps } from '@props/publisher/publishing-overview.props';
import Card from '@ui/card/Card';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const STATE_BADGE_VARIANT = {
  healthy: 'success',
  not_started: 'secondary',
  risky: 'warning',
  warming: 'info',
} as const;

const STATE_MESSAGE_KEYS = {
  healthy: 'healthState.healthy',
  not_started: 'healthState.not_started',
  risky: 'healthState.risky',
  warming: 'healthState.warming',
} as const;

const RISK_BADGE_VARIANT = {
  high: 'destructive',
  medium: 'warning',
} as const;

const RISK_MESSAGE_KEYS = {
  high: 'healthRisk.high',
  medium: 'healthRisk.medium',
} as const;

export default function AccountHealthSection({
  rows,
}: PublishingOverviewHealthSectionProps) {
  const translate = useTranslations('pages.publishing.overview');
  const { href } = useOrgUrl();

  return (
    <Card
      bodyClassName="flex flex-col gap-4 p-5"
      data-testid="publishing-overview-health"
      description={translate('healthDescription')}
      label={translate('healthTitle')}
    >
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.credentialId}
              className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <PlatformBadge platform={row.platform} showLabel={false} />
                <span className="min-w-0 truncate text-sm font-medium">
                  {row.accountLabel}
                </span>
                <Badge variant={STATE_BADGE_VARIANT[row.state]}>
                  {translate(STATE_MESSAGE_KEYS[row.state])}
                </Badge>
                {row.riskLevel === 'high' || row.riskLevel === 'medium' ? (
                  <Badge variant={RISK_BADGE_VARIANT[row.riskLevel]}>
                    {translate(RISK_MESSAGE_KEYS[row.riskLevel])}
                  </Badge>
                ) : null}
                {row.needsReconnect ? (
                  <Badge variant="destructive">
                    {translate('healthReconnect')}
                  </Badge>
                ) : null}
                {row.holdPublishing ? (
                  <Badge variant="warning">{translate('healthHold')}</Badge>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {translate('healthScore', { score: row.score })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {translate('healthSignals', {
                    days: row.connectedDays,
                    failures: row.recentFailures,
                    posts: row.publishedPosts,
                  })}
                </span>
                {row.needsReconnect ? (
                  <Button asChild size={ButtonSize.SM} withWrapper={false}>
                    <Link href={href(APP_ROUTES.SETTINGS.SOCIAL)}>
                      {translate('healthReconnectAction')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('healthEmpty')}
        </p>
      )}
    </Card>
  );
}
