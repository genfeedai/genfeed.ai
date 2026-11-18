'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useLocale, useTranslations } from 'next-intl';
import { useOverviewBootstrap } from '@/hooks/data/overview/use-overview-bootstrap';
import type { PlatformTimeSeriesDataPoint } from '@/props/analytics/charts.props';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import { RailPreviewSection, RailPreviewStat } from './rail-preview-parts';

const SPARK_WIDTH = 280;
const SPARK_HEIGHT = 40;

/** The platforms' daily totals, summed into one line. */
function sumDay(point: PlatformTimeSeriesDataPoint): number {
  return Object.entries(point).reduce(
    (total, [key, value]) =>
      key !== 'date' && typeof value === 'number' ? total + value : total,
    0,
  );
}

function sparkPath(values: readonly number[]): string {
  const max = Math.max(...values, 1);
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * SPARK_WIDTH;
      const y = SPARK_HEIGHT - 2 - (value / max) * (SPARK_HEIGHT - 4);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Analytics: the headline numbers and the recent trend. */
export default function AnalyticsRailPreview(
  _props: AppRailPreviewContentProps,
) {
  const translate = useTranslations('common.appRail.preview.analytics');
  const locale = useLocale();
  const { brandId } = useBrand();
  const { analytics, isError, isLoading, timeSeriesData } =
    useOverviewBootstrap({ brandId: brandId || undefined });
  const compact = new Intl.NumberFormat(locale, { notation: 'compact' });
  const percent = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: 'percent',
  });
  const series = timeSeriesData.slice(-14).map(sumDay);

  if (isLoading) {
    return (
      <div aria-busy="true" className="grid grid-cols-2 gap-1.5 p-1">
        {['views', 'engagement', 'posts', 'platforms'].map((key) => (
          <div className="h-16 rounded-lg bg-foreground/5" key={key} />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <p className="px-2.5 py-3 text-sm text-muted-foreground" role="status">
        {translate('error')}
      </p>
    );
  }

  return (
    <div className="p-1">
      <div className="grid grid-cols-2 gap-1.5">
        <RailPreviewStat
          label={translate('views')}
          value={compact.format(analytics.totalViews ?? 0)}
        />
        <RailPreviewStat
          label={translate('engagement')}
          value={percent.format((analytics.avgEngagementRate ?? 0) / 100)}
        />
        <RailPreviewStat
          label={translate('posts')}
          value={compact.format(analytics.totalPosts ?? 0)}
        />
        <RailPreviewStat
          label={translate('platforms')}
          value={compact.format(analytics.activePlatforms?.length ?? 0)}
        />
      </div>
      {series.length > 1 ? (
        <RailPreviewSection title={translate('trend')}>
          <svg
            aria-hidden="true"
            className="h-10 w-full px-2.5 text-info"
            preserveAspectRatio="none"
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
          >
            <path
              d={sparkPath(series)}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </RailPreviewSection>
      ) : null}
    </div>
  );
}
