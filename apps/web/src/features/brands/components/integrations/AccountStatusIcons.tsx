'use client';

import type { AccountHealthSummary } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import type { AccountStatusIconsProps } from '@props/pages/brand-integrations.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import {
  CircleCheck,
  CircleDashed,
  Flame,
  HeartPulse,
  type LucideIcon,
  MessageSquareWarning,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  getAccountConnectionStatus,
  hasWarmupBlueprint,
  needsDirectMessageReconnect,
  STATE_MESSAGE_KEYS,
} from './account-connection-status.util';
import { getHealthBadgeVariant } from './account-health-badge-variant';

const HEALTH_STATE_ICONS = {
  healthy: HeartPulse,
  not_started: CircleDashed,
  risky: ShieldAlert,
  warming: Flame,
} as const satisfies Record<AccountHealthSummary['state'], LucideIcon>;

interface StatusIconProps {
  icon: LucideIcon;
  label: string;
  tone: 'success' | 'warning';
}

/** A status with nothing to click: the icon names itself in a tooltip. */
function StatusIcon({ icon: Icon, label, tone }: StatusIconProps) {
  return (
    <SimpleTooltip label={label}>
      <span
        aria-label={label}
        className={cn(
          'inline-flex size-8 items-center justify-center',
          tone === 'success' ? 'text-success' : 'text-warning',
        )}
        role="img"
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
    </SimpleTooltip>
  );
}

/**
 * Status column of the Accounts table: one icon per state, the full wording as
 * the icon's accessible name. The icons only show state. What the person can
 * do about it (Reconnect, with the cause in its tooltip) is in the row's hover
 * actions, which replace these icons while the row is hovered, so nothing here
 * is a button that the actions could cover.
 *
 * "Needs reconnect" wins over everything else. A connected account shows a
 * check; when the platform runs the warm-up blueprint and health data is
 * available, its warm-up state sits next to the check rather than replacing it,
 * so a warming account never reads as if the connection were in doubt.
 */
export default function AccountStatusIcons({
  connection,
  health: healthOverride,
}: AccountStatusIconsProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const needsReconnect =
    getAccountConnectionStatus(connection) === 'needsReconnect';

  // `healthOverride` is the live-fetched health for the brand; the connection's
  // own `accountHealth` is whatever the brand payload carried. Prefer the
  // fresher source.
  const health = healthOverride ?? connection.accountHealth;

  return (
    <div className="flex items-center justify-end gap-0.5">
      {needsReconnect ? (
        <StatusIcon
          icon={TriangleAlert}
          label={translate('needsReconnect')}
          tone="warning"
        />
      ) : (
        <StatusIcon
          icon={CircleCheck}
          label={translate('connected')}
          tone="success"
        />
      )}
      {!needsReconnect && health && hasWarmupBlueprint(connection.platform) ? (
        <StatusIcon
          icon={HEALTH_STATE_ICONS[health.state]}
          label={translate(STATE_MESSAGE_KEYS[health.state])}
          tone={
            getHealthBadgeVariant(health) === 'warning' ? 'warning' : 'success'
          }
        />
      ) : null}
      {needsDirectMessageReconnect(connection) ? (
        <StatusIcon
          icon={MessageSquareWarning}
          label={translate('dmReconnectBadge')}
          tone="warning"
        />
      ) : null}
    </div>
  );
}
