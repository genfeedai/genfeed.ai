'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { Skeleton } from '@ui/primitives/skeleton';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type {
  CreationHeatmapCell,
  CreationHeatmapProps,
} from '@/props/analytics/creation-heatmap.props';

const HEATMAP_DAY_COUNT = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const INTENSITY_CLASSES = [
  'bg-foreground/10',
  'bg-foreground/20',
  'bg-foreground/40',
  'bg-foreground/80',
] as const;

function getIntensityLevel(count: number): number {
  if (count >= 4) {
    return 3;
  }

  if (count >= 2) {
    return 2;
  }

  return count >= 1 ? 1 : 0;
}

/**
 * Last 90 days (UTC, matching the calendar keys), padded at the start so the
 * first day lands on its weekday row. Cells fill column by column, 7 per week.
 */
function buildHeatmapCells(): CreationHeatmapCell[] {
  const today = new Date();
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const days = Array.from(
    { length: HEATMAP_DAY_COUNT },
    (_, index) =>
      new Date(todayUtc - (HEATMAP_DAY_COUNT - 1 - index) * MS_PER_DAY),
  );
  const leadingBlanks = days[0].getUTCDay();

  return [
    ...Array.from({ length: leadingBlanks }, () => ({ dayKey: null })),
    ...days.map((date) => ({ dayKey: date.toISOString().slice(0, 10) })),
  ];
}

export default function CreationHeatmap({
  calendar,
  isLoading = false,
}: CreationHeatmapProps) {
  const translate = useTranslations('ui.creationHeatmap');
  const cells = useMemo(buildHeatmapCells, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <div
          className="grid w-max grid-flow-col grid-rows-7 gap-1"
          data-testid={isLoading ? 'streaks-heatmap-skeleton' : undefined}
        >
          {cells.map((cell, index) => {
            if (!cell.dayKey) {
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: blank padding cells have no identity
                  key={`blank-${index}`}
                  className="size-3.5"
                />
              );
            }

            const count = calendar[cell.dayKey]?.count ?? 0;

            if (isLoading) {
              return (
                <Skeleton
                  key={cell.dayKey}
                  aria-hidden="true"
                  className="size-3.5 rounded-sm"
                />
              );
            }

            return (
              <SimpleTooltip
                key={cell.dayKey}
                label={translate('cellTitle', { count, day: cell.dayKey })}
              >
                <div
                  role="img"
                  aria-label={translate('cellTitle', {
                    count,
                    day: cell.dayKey,
                  })}
                  className={cn(
                    'size-3.5 rounded-sm transition-colors',
                    INTENSITY_CLASSES[getIntensityLevel(count)],
                  )}
                />
              </SimpleTooltip>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{translate('less')}</span>
        {INTENSITY_CLASSES.map((intensityClass) => (
          <div
            key={intensityClass}
            className={cn('size-3.5 rounded-sm', intensityClass)}
          />
        ))}
        <span>{translate('more')}</span>
      </div>
    </div>
  );
}
