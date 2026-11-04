import type {
  FactValueProps,
  MetricListProps,
  StatusBadgeProps,
} from '@mcp/shared/interfaces/mcp-preview.interface';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  Eye,
  Info,
  type LucideIcon,
  Minus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react';

/**
 * Icons for statuses the shared Badge has no icon of its own for: account
 * roles and review states. Canonical statuses (active, scheduled, failed…)
 * keep the icon the shared Badge gives them.
 */
const STATUS_ICONS: Readonly<Record<string, LucideIcon>> = {
  admin: ShieldCheck,
  editor: User,
  member: User,
  needs_review: Eye,
  owner: ShieldCheck,
  user: User,
  viewer: User,
};

/**
 * Domain states the shared Badge has no wording for: a channel that can
 * publish is "Ready", a validated target is "Valid". Each maps onto a
 * canonical tone and keeps its own label.
 */
const STATUS_ALIASES: Readonly<
  Record<string, { label: string; status: string }>
> = {
  degraded: { label: 'Degraded', status: 'needs_attention' },
  hidden: { label: 'Unavailable', status: 'planned' },
  invalid: { label: 'Invalid', status: 'failed' },
  publish_capable: { label: 'Ready', status: 'healthy' },
  published: { label: 'Published', status: 'published' },
  supported: { label: 'Supported', status: 'completed' },
  valid: { label: 'Valid', status: 'completed' },
};

/** Every status on every card: uppercase, tinted, with an icon. */
export function StatusBadge({ label, status }: StatusBadgeProps) {
  const key = status.trim().toLowerCase().replace(/\s+/g, '_');
  const alias = STATUS_ALIASES[key];
  const Icon = STATUS_ICONS[key] ?? Info;
  return (
    <Badge status={alias?.status ?? key} icon={<Icon />} className="shrink-0">
      {label ?? alias?.label}
    </Badge>
  );
}

/** A fact's value: iconed status, a row of chips, or plain text. */
export function FactValue({ fact }: FactValueProps) {
  if (fact.status)
    return <StatusBadge status={fact.status} label={fact.value} />;
  if (fact.items?.length)
    return (
      <ul className="flex min-w-0 flex-wrap gap-1.5">
        {fact.items.map((item) => (
          <li
            key={`${item.platform ?? 'chip'}-${item.label}`}
            className="min-w-0"
          >
            {item.platform ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border p-1 pe-1.5">
                <PlatformBadge platform={item.platform} />
                {item.status ? <StatusBadge status={item.status} /> : null}
              </span>
            ) : (
              <Badge
                variant="outline"
                casing="normal"
                size="lg"
                isTruncated
                icon={
                  item.avatarUrl || item.hasAvatar ? (
                    <Avatar
                      name={item.label}
                      shape="square"
                      size="2xs"
                      src={item.avatarUrl}
                    />
                  ) : undefined
                }
              >
                {item.label}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    );
  return <span className="break-words">{fact.value}</span>;
}

const TREND_ICONS = { down: TrendingDown, flat: Minus, up: TrendingUp };

/** Headline figures: the first one large, the rest in a row beneath it. */
export function MetricList({ metrics }: MetricListProps) {
  const primary = metrics.find((metric) => metric.isPrimary) ?? metrics[0];
  const rest = metrics.filter((metric) => metric !== primary);
  if (!primary) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Text size="xs" color="muted">
          {primary.label}
        </Text>
        <Heading as="p" size="2xl" className="tabular-nums">
          {primary.value}
        </Heading>
      </div>
      {rest.length ? (
        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          {rest.map((metric) => {
            const TrendIcon = metric.trend
              ? TREND_ICONS[metric.trend.direction]
              : undefined;
            return (
              <div key={metric.label} className="flex min-w-0 flex-col gap-0.5">
                <Text as="dt" size="xs" color="muted">
                  {metric.label}
                </Text>
                <dd className="flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums">
                  {metric.value}
                  {metric.trend && TrendIcon ? (
                    <Badge variant="info" icon={<TrendIcon />}>
                      {metric.trend.label}
                    </Badge>
                  ) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </div>
  );
}
