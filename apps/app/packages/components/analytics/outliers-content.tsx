'use client';

import BrandTopVideosSection from '@app-components/analytics/top-videos/brand-top-videos-section';
import {
  DEFAULT_TOP_VIDEOS_TIMEFRAME,
  TOP_VIDEOS_TIMEFRAMES,
} from '@app-components/analytics/top-videos/use-brand-top-videos';
import RemixBriefInspector from '@app-components/research/remix/RemixBriefInspector';
import {
  useAnalyticsContext,
  useAnalyticsToolbar,
} from '@genfeedai/contexts/analytics/analytics-context';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import AnalyticsOutliers from '@pages/analytics/outliers/analytics-outliers';
import { DiscoveryRemixProvider } from '@pages/research/remix/DiscoveryRemixProvider';
import AnalyticsFilterMenu from '@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const PLATFORM_VALUES = [
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
] as const;

const TIER_VALUES = ['outlier', 'breakout'] as const;

export default function OutliersContent() {
  const translate = useTranslations('pages.analytics.outliers');
  const translateTopVideos = useTranslations('pages.analytics.topVideos');
  const { filters, setFilter } = useAnalyticsContext();
  const platform = filters.platform;
  const tier = TIER_VALUES.find((value) => value === filters.tier);
  const timeframe = filters.timeframe ?? DEFAULT_TOP_VIDEOS_TIMEFRAME;

  const toolbar = useMemo(() => {
    const facets: FilterMenuFacet[] = [
      {
        defaultValue: '',
        key: 'platform',
        label: translate('platform'),
        onChange: (value) => setFilter('platform', value || undefined),
        options: PLATFORM_VALUES.map((value) => ({
          label: translate(value),
          value,
        })),
        selection: 'single',
        value: platform ?? '',
      },
      {
        defaultValue: '',
        key: 'tier',
        label: translate('tier'),
        onChange: (value) => setFilter('tier', value || undefined),
        options: TIER_VALUES.map((value) => ({
          label: translate(
            value === 'outlier' ? 'outlierTier' : 'breakoutTier',
          ),
          value,
        })),
        selection: 'single',
        value: tier ?? '',
      },
      {
        defaultValue: DEFAULT_TOP_VIDEOS_TIMEFRAME,
        key: 'timeframe',
        label: translateTopVideos('timeframe'),
        onChange: (value) => setFilter('timeframe', value || undefined),
        options: TOP_VIDEOS_TIMEFRAMES.map((value) => ({
          label: translateTopVideos(`timeframes.${value}`),
          value,
        })),
        selection: 'single',
        value: timeframe,
      },
    ];

    return (
      <AnalyticsFilterMenu
        facets={facets}
        onClear={() => {
          setFilter('platform');
          setFilter('tier');
          setFilter('timeframe');
        }}
      />
    );
  }, [platform, setFilter, tier, timeframe, translate, translateTopVideos]);

  useAnalyticsToolbar(toolbar);

  return (
    <DiscoveryRemixProvider>
      <RemixBriefInspector />
      <div className="space-y-8">
        <BrandTopVideosSection />
        <AnalyticsOutliers platform={platform} tier={tier} />
      </div>
    </DiscoveryRemixProvider>
  );
}
