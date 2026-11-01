'use client';

import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import type { AccountStatusBadgeProps } from '@props/pages/brand-integrations.props';
import type { BadgeProps } from '@ui/primitives/badge';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';
import {
  getAccountConnectionStatus,
  hasWarmupBlueprint,
  STATE_MESSAGE_KEYS,
} from './account-connection-status.util';

function getHealthBadgeVariant(
  summary: AccountHealthSummary,
): BadgeProps['variant'] {
  if (summary.override.isActive) {
    return 'info';
  }

  if (summary.holdPublishing || summary.riskLevel === 'high') {
    return 'warning';
  }

  return 'success';
}

/**
 * Status column: "Needs reconnect" takes priority over everything else, a
 * warm-up state comes next when the platform runs the warmup blueprint and
 * health data is available, and "Connected" is the default otherwise.
 */
export default function AccountStatusBadge({
  connection,
  health: healthOverride,
}: AccountStatusBadgeProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const status = getAccountConnectionStatus(connection);

  if (status === 'needsReconnect') {
    return <Badge variant="warning">{translate('needsReconnect')}</Badge>;
  }

  // `healthOverride` is the live-fetched health for the brand (see
  // AccountsTableProps.accountHealth); `connection.accountHealth` is
  // whatever the brand payload itself carried. Prefer the fresher source.
  const health = healthOverride ?? connection.accountHealth;
  if (health && hasWarmupBlueprint(connection.platform)) {
    return (
      <Badge variant={getHealthBadgeVariant(health)}>
        {translate(STATE_MESSAGE_KEYS[health.state])}
      </Badge>
    );
  }

  return <Badge variant="success">{translate('connected')}</Badge>;
}
