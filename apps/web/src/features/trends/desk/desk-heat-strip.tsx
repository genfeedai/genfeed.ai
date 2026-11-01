'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import { Toggle } from '@ui/primitives/toggle';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { DiscoveryDeskItem } from '@/features/trends/props/discovery-desk.props';

interface PlatformHeat {
  count: number;
  isLocked: boolean;
  platform: string;
  topVelocity: number;
}

function buildPlatformHeat(
  items: DiscoveryDeskItem[],
  summary: TrendsSummary,
): PlatformHeat[] {
  const counts = new Map<string, { count: number; topVelocity: number }>();
  for (const item of items) {
    const existing = counts.get(item.platform) ?? { count: 0, topVelocity: 0 };
    existing.count += 1;
    existing.topVelocity = Math.max(existing.topVelocity, item.velocity);
    counts.set(item.platform, existing);
  }

  const lockedSet = new Set(summary.lockedPlatforms);
  const platforms = new Set<string>([
    ...summary.connectedPlatforms,
    ...summary.lockedPlatforms,
    ...counts.keys(),
  ]);

  return Array.from(platforms)
    .map((platform) => ({
      count: counts.get(platform)?.count ?? 0,
      isLocked: lockedSet.has(platform),
      platform,
      topVelocity: counts.get(platform)?.topVelocity ?? 0,
    }))
    .sort((a, b) => b.topVelocity - a.topVelocity || b.count - a.count);
}

/**
 * Compact per-platform heat row above the Desk filter rail. Connected
 * platforms toggle the platform filter on click; locked platforms link to
 * publishing settings instead of toggling anything.
 */
export default function DeskHeatStrip({
  activePlatforms,
  items,
  onTogglePlatform,
  publishingHref,
  summary,
}: {
  activePlatforms: Set<string>;
  items: DiscoveryDeskItem[];
  onTogglePlatform: (platform: string) => void;
  publishingHref: string;
  summary: TrendsSummary;
}) {
  const translateCard = useTranslations('common.trends.card');
  const heat = useMemo(
    () => buildPlatformHeat(items, summary),
    [items, summary],
  );

  if (!heat.length) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {heat.map(({ count, isLocked, platform, topVelocity }) => {
        if (isLocked) {
          return (
            <SimpleTooltip
              key={platform}
              label="Connect this platform to add signal"
            >
              <Link
                aria-label={platform}
                className="gen-glass-subtle flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-foreground/50 transition hover:text-foreground/80"
                href={publishingHref}
              >
                <Lock className="size-3" />
                {getPlatformIcon(platform, 'size-3.5 opacity-60')}
              </Link>
            </SimpleTooltip>
          );
        }

        const isActive = activePlatforms.has(platform);
        return (
          <Toggle
            aria-label={platform}
            key={platform}
            onPressedChange={() => onTogglePlatform(platform)}
            pressed={isActive}
            size="sm"
            variant="chip"
          >
            {getPlatformIcon(platform, 'size-3.5')}
            <span className="text-muted-foreground">{count}</span>
            {topVelocity > 0 ? (
              <span className="text-muted-foreground">
                ·{' '}
                {translateCard('velocityPerHour', {
                  value: formatCompactNumber(topVelocity),
                })}
              </span>
            ) : null}
          </Toggle>
        );
      })}
    </div>
  );
}
