'use client';

import {
  AdsChannel,
  AdsPlatform,
  type AdsResearchMetric,
  type AdsResearchPlatform,
  type AdsResearchTimeframe,
} from '@genfeedai/contracts/interfaces';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import type { UnifiedAdAccountOption } from '@services/ads/ads-research.service';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import type {
  AdSortKey,
  AdsResearchViewSource,
} from './useAdsResearchPageClient';

/** FilterMenu options need a non-empty wire value; '' means "none" upstream. */
const NONE_VALUE = '__none__';

const SOURCE_OPTIONS: Array<{
  messageKey: 'all' | 'myAccounts' | 'public' | 'saved';
  value: AdsResearchViewSource;
}> = [
  { messageKey: 'all', value: 'all' },
  { messageKey: 'public', value: 'public' },
  { messageKey: 'myAccounts', value: 'my_accounts' },
  { messageKey: 'saved', value: 'saved' },
];

const PLATFORM_OPTIONS: Array<{
  messageKey: 'all' | 'google' | 'meta' | 'tiktok' | 'x';
  value: AdsResearchPlatform | 'all';
}> = [
  { messageKey: 'all', value: 'all' },
  { messageKey: 'meta', value: AdsPlatform.META },
  { messageKey: 'google', value: AdsPlatform.GOOGLE },
  { messageKey: 'tiktok', value: AdsPlatform.TIKTOK },
  { messageKey: 'x', value: AdsPlatform.X },
];

const SORT_OPTIONS: Array<{
  messageKey: 'ctr' | 'longevity' | 'roas' | 'score';
  value: AdSortKey;
}> = [
  { messageKey: 'score', value: 'score' },
  { messageKey: 'ctr', value: 'ctr' },
  { messageKey: 'roas', value: 'roas' },
  // The only ranking axis competitor archive rows carry: no archive publishes
  // CTR or ROAS, but all of them publish how long an ad has been running.
  { messageKey: 'longevity', value: 'longevity' },
];

const GOOGLE_CHANNEL_OPTIONS: Array<{
  messageKey: 'all' | 'display' | 'search' | 'youtube';
  value: AdsChannel;
}> = [
  { messageKey: 'all', value: AdsChannel.ALL },
  { messageKey: 'search', value: AdsChannel.SEARCH },
  { messageKey: 'display', value: AdsChannel.DISPLAY },
  { messageKey: 'youtube', value: AdsChannel.YOUTUBE },
];

const METRIC_OPTIONS: Array<{
  messageKey:
    | 'conversions'
    | 'ctr'
    | 'performanceScore'
    | 'roas'
    | 'spendEfficiency';
  value: AdsResearchMetric;
}> = [
  { messageKey: 'performanceScore', value: 'performanceScore' },
  { messageKey: 'ctr', value: 'ctr' },
  { messageKey: 'roas', value: 'roas' },
  { messageKey: 'conversions', value: 'conversions' },
  { messageKey: 'spendEfficiency', value: 'spendEfficiency' },
];

const TIMEFRAME_OPTIONS: Array<{
  messageKey: 'allTime' | 'last7Days' | 'last30Days' | 'last90Days';
  value: AdsResearchTimeframe;
}> = [
  { messageKey: 'last7Days', value: 'last_7_days' },
  { messageKey: 'last30Days', value: 'last_30_days' },
  { messageKey: 'last90Days', value: 'last_90_days' },
  { messageKey: 'allTime', value: 'all_time' },
];

type CredentialOption = {
  id: string;
  externalHandle?: string;
  externalId?: string;
  externalName?: string;
  platform?: string;
};

function getCredentialLabel(credential: CredentialOption) {
  return (
    credential.externalHandle ||
    credential.externalName ||
    credential.externalId ||
    credential.platform ||
    credential.id
  );
}

type AdsResearchFilterMenuProps = {
  adAccountId: string;
  adAccounts: UnifiedAdAccountOption[];
  channel: AdsChannel;
  connectedCount: number;
  credentialId: string;
  credentialOptions: CredentialOption[];
  isAttached?: boolean;
  metric: AdsResearchMetric;
  platform: AdsResearchPlatform | 'all';
  publicCount: number;
  showChannelFilter: boolean;
  sortKey: AdSortKey;
  source: AdsResearchViewSource;
  timeframe: AdsResearchTimeframe;
  onAdAccountChange: (value: string) => void;
  onChannelChange: (value: AdsChannel) => void;
  onClear: () => void;
  onCredentialChange: (value: string) => void;
  onMetricChange: (value: AdsResearchMetric) => void;
  onPlatformChange: (value: AdsResearchPlatform | 'all') => void;
  onSortChange: (value: AdSortKey) => void;
  onSourceChange: (value: AdsResearchViewSource) => void;
  onTimeframeChange: (value: AdsResearchTimeframe) => void;
};

function isIn<T extends string>(
  options: ReadonlyArray<{ value: T }>,
  value: string,
): value is T {
  return options.some((option) => option.value === value);
}

/**
 * Platform, source, sort, metric, timeframe and account scope in the one
 * shared Filters menu, so the Ads subbar matches every other page.
 */
export function AdsResearchFilterMenu({
  adAccountId,
  adAccounts,
  channel,
  connectedCount,
  credentialId,
  credentialOptions,
  isAttached,
  metric,
  platform,
  publicCount,
  showChannelFilter,
  sortKey,
  source,
  timeframe,
  onAdAccountChange,
  onChannelChange,
  onClear,
  onCredentialChange,
  onMetricChange,
  onPlatformChange,
  onSortChange,
  onSourceChange,
  onTimeframeChange,
}: AdsResearchFilterMenuProps) {
  const translate = useTranslations('pages.adsResearch.filters');
  // Saved ads are counted by their own list; the other three come from the
  // result summary, so a zero-ads account still reads as zero.
  const sourceCounts: Partial<Record<AdsResearchViewSource, number>> = {
    all: publicCount + connectedCount,
    my_accounts: connectedCount,
    public: publicCount,
  };
  const sourceOptions = SOURCE_OPTIONS.map(({ messageKey, value }) => ({
    count: sourceCounts[value],
    label: translate(`sources.${messageKey}`),
    value,
  }));
  const platformOptions = PLATFORM_OPTIONS.map(({ messageKey, value }) => ({
    label: translate(`platforms.${messageKey}`),
    value,
  }));
  const sortOptions = SORT_OPTIONS.map(({ messageKey, value }) => ({
    label: translate(`sorts.${messageKey}`),
    value,
  }));
  const metricOptions = METRIC_OPTIONS.map(({ messageKey, value }) => ({
    label: translate(`metrics.${messageKey}`),
    value,
  }));
  const timeframeOptions = TIMEFRAME_OPTIONS.map(({ messageKey, value }) => ({
    label: translate(`timeframes.${messageKey}`),
    value,
  }));
  const channelOptions = GOOGLE_CHANNEL_OPTIONS.map(
    ({ messageKey, value }) => ({
      label: translate(`channels.${messageKey}`),
      value,
    }),
  );

  const facets: FilterMenuFacet[] = [
    {
      defaultValue: 'all',
      key: 'platform',
      label: translate('platform'),
      onChange: (value) => {
        if (isIn(platformOptions, value)) {
          onPlatformChange(value);
        }
      },
      options: platformOptions,
      selection: 'single',
      value: platform,
    },
    {
      defaultValue: 'all',
      key: 'source',
      label: translate('source'),
      onChange: (value) => {
        if (isIn(sourceOptions, value)) {
          onSourceChange(value);
        }
      },
      options: sourceOptions,
      selection: 'single',
      value: source,
    },
    {
      defaultValue: 'score',
      isCounted: false,
      key: 'sort',
      label: translate('sort'),
      onChange: (value) => {
        if (isIn(sortOptions, value)) {
          onSortChange(value);
        }
      },
      options: sortOptions,
      selection: 'single',
      value: sortKey,
    },
    {
      defaultValue: 'performanceScore',
      isCounted: false,
      key: 'metric',
      label: translate('metric'),
      onChange: (value) => {
        if (isIn(metricOptions, value)) {
          onMetricChange(value);
        }
      },
      options: metricOptions,
      selection: 'single',
      value: metric,
    },
  ];

  if (source !== 'saved') {
    facets.push({
      defaultValue: 'last_30_days',
      key: 'timeframe',
      label: translate('timeframe'),
      onChange: (value) => {
        if (isIn(timeframeOptions, value)) {
          onTimeframeChange(value);
        }
      },
      options: timeframeOptions,
      selection: 'single',
      value: timeframe,
    });
  }

  if (showChannelFilter) {
    facets.push({
      defaultValue: AdsChannel.ALL,
      key: 'channel',
      label: translate('channel'),
      onChange: (value) => {
        if (isIn(channelOptions, value)) {
          onChannelChange(value);
        }
      },
      options: channelOptions,
      selection: 'single',
      value: channel,
    });
  }

  facets.push(
    {
      defaultValue: NONE_VALUE,
      key: 'credential',
      label: translate('credential'),
      onChange: (value) =>
        onCredentialChange(value === NONE_VALUE ? '' : value),
      options: [
        { label: translate('noCredential'), value: NONE_VALUE },
        ...credentialOptions.map((credential) => ({
          isLiteral: true,
          label: getCredentialLabel(credential),
          value: credential.id,
        })),
      ],
      selection: 'single',
      value: credentialId || NONE_VALUE,
    },
    {
      defaultValue: NONE_VALUE,
      key: 'adAccount',
      label: translate('adAccount'),
      onChange: (value) => onAdAccountChange(value === NONE_VALUE ? '' : value),
      options: [
        { label: translate('noAdAccount'), value: NONE_VALUE },
        ...adAccounts.map((account) => ({
          isLiteral: true,
          label: account.name || account.id,
          value: account.id,
        })),
      ],
      selection: 'single',
      value: adAccountId || NONE_VALUE,
    },
  );

  return (
    <FilterMenu facets={facets} isAttached={isAttached} onClear={onClear} />
  );
}

type AdsResearchTextFiltersProps = {
  effectivePlatform: AdsResearchPlatform | 'all';
  industry: string;
  loginCustomerId: string;
  source: AdsResearchViewSource;
  onIndustryChange: (value: string) => void;
  onLoginCustomerIdChange: (value: string) => void;
};

/** The two free-text filters, which a pick-list menu cannot hold. */
export function AdsResearchTextFilters({
  effectivePlatform,
  industry,
  loginCustomerId,
  source,
  onIndustryChange,
  onLoginCustomerIdChange,
}: AdsResearchTextFiltersProps) {
  const translate = useTranslations('pages.adsResearch.filters');
  const isIndustryShown = source !== 'saved';
  const isLoginCustomerShown = effectivePlatform === AdsPlatform.GOOGLE;

  if (!isIndustryShown && !isLoginCustomerShown) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {isIndustryShown ? (
        <Input
          value={industry}
          onChange={(event) => onIndustryChange(event.target.value)}
          placeholder={translate('industryPlaceholder')}
          className="h-8 w-[160px] text-xs"
        />
      ) : null}
      {isLoginCustomerShown ? (
        <Input
          value={loginCustomerId}
          onChange={(event) => onLoginCustomerIdChange(event.target.value)}
          placeholder={translate('loginCustomerPlaceholder')}
          className="h-8 w-[140px] text-xs"
        />
      ) : null}
    </div>
  );
}
