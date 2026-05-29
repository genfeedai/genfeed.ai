'use client';

import type {
  AdsChannel,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchSource,
  AdsResearchTimeframe,
} from '@genfeedai/interfaces';
import type { UnifiedAdAccountOption } from '@services/ads/ads-research.service';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';

const ALL_FILTER_VALUE = '__all__';

const SOURCE_OPTIONS: Array<{ label: string; value: AdsResearchSource }> = [
  { label: 'Public + My Accounts', value: 'all' },
  { label: 'Public', value: 'public' },
  { label: 'My Accounts', value: 'my_accounts' },
];

const PLATFORM_OPTIONS: Array<{
  label: string;
  value: AdsResearchPlatform | 'all';
}> = [
  { label: 'All Platforms', value: 'all' },
  { label: 'Meta Ads', value: 'meta' },
  { label: 'Google Ads', value: 'google' },
];

const GOOGLE_CHANNEL_OPTIONS: Array<{ label: string; value: AdsChannel }> = [
  { label: 'All Inventory', value: 'all' },
  { label: 'Search', value: 'search' },
  { label: 'Display', value: 'display' },
  { label: 'YouTube', value: 'youtube' },
];

const METRIC_OPTIONS: Array<{ label: string; value: AdsResearchMetric }> = [
  { label: 'Performance Score', value: 'performanceScore' },
  { label: 'CTR', value: 'ctr' },
  { label: 'ROAS', value: 'roas' },
  { label: 'Conversions', value: 'conversions' },
  { label: 'Spend Efficiency', value: 'spendEfficiency' },
];

const TIMEFRAME_OPTIONS: Array<{
  label: string;
  value: AdsResearchTimeframe;
}> = [
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Last 90 Days', value: 'last_90_days' },
  { label: 'All Time', value: 'all_time' },
];

type CredentialOption = {
  id: string;
  externalHandle?: string;
  externalId?: string;
  platform?: string;
};

function getCredentialLabel(credential: CredentialOption) {
  return (
    credential.externalHandle ||
    credential.externalId ||
    credential.platform ||
    credential.id
  );
}

function FilterSelect<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <Select
      value={value || (ALL_FILTER_VALUE as T)}
      onValueChange={(nextValue) =>
        onChange((nextValue === ALL_FILTER_VALUE ? '' : nextValue) as T)
      }
    >
      <SelectTrigger className="h-8 w-auto min-w-[120px] bg-transparent text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value || ALL_FILTER_VALUE}
            value={option.value || ALL_FILTER_VALUE}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type AdsResearchFilterPanelProps = {
  adAccountId: string;
  adAccounts: UnifiedAdAccountOption[];
  channel: AdsChannel;
  credentialId: string;
  credentialOptions: CredentialOption[];
  effectivePlatform: AdsResearchPlatform | 'all';
  industry: string;
  initialPlatform: AdsResearchPlatform | 'all';
  loginCustomerId: string;
  metric: AdsResearchMetric;
  platform: AdsResearchPlatform | 'all';
  showChannelFilter: boolean;
  source: AdsResearchSource;
  timeframe: AdsResearchTimeframe;
  onAdAccountChange: (value: string) => void;
  onChannelChange: (value: AdsChannel) => void;
  onCredentialChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  onLoginCustomerIdChange: (value: string) => void;
  onMetricChange: (value: AdsResearchMetric) => void;
  onPlatformChange: (value: AdsResearchPlatform | 'all') => void;
  onSourceChange: (value: AdsResearchSource) => void;
  onTimeframeChange: (value: AdsResearchTimeframe) => void;
};

export function AdsResearchFilterPanel({
  adAccountId,
  adAccounts,
  channel,
  credentialId,
  credentialOptions,
  effectivePlatform,
  industry,
  initialPlatform,
  loginCustomerId,
  metric,
  platform,
  showChannelFilter,
  source,
  timeframe,
  onAdAccountChange,
  onChannelChange,
  onCredentialChange,
  onIndustryChange,
  onLoginCustomerIdChange,
  onMetricChange,
  onPlatformChange,
  onSourceChange,
  onTimeframeChange,
}: AdsResearchFilterPanelProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {initialPlatform === 'all' && (
        <FilterSelect
          label="Platform"
          options={PLATFORM_OPTIONS}
          value={platform}
          onChange={(value) =>
            onPlatformChange((value || 'all') as AdsResearchPlatform | 'all')
          }
        />
      )}
      <FilterSelect
        label="Source"
        options={SOURCE_OPTIONS}
        value={source}
        onChange={onSourceChange}
      />
      {showChannelFilter && (
        <FilterSelect
          label="Google Channel"
          options={GOOGLE_CHANNEL_OPTIONS}
          value={channel}
          onChange={onChannelChange}
        />
      )}
      <FilterSelect
        label="Metric"
        options={METRIC_OPTIONS}
        value={metric}
        onChange={onMetricChange}
      />
      <FilterSelect
        label="Timeframe"
        options={TIMEFRAME_OPTIONS}
        value={timeframe}
        onChange={onTimeframeChange}
      />
      <Input
        value={industry}
        onChange={(event) => onIndustryChange(event.target.value)}
        placeholder="Niche / industry…"
        className="h-8 w-[160px] text-xs"
      />
      <Select
        value={credentialId || ALL_FILTER_VALUE}
        onValueChange={(value) =>
          onCredentialChange(value === ALL_FILTER_VALUE ? '' : value)
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-[160px] bg-transparent text-xs">
          <SelectValue placeholder="Credential" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_FILTER_VALUE}>No credential</SelectItem>
          {credentialOptions.map((credential) => (
            <SelectItem key={credential.id} value={credential.id}>
              {getCredentialLabel(credential)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={adAccountId || ALL_FILTER_VALUE}
        onValueChange={(value) =>
          onAdAccountChange(value === ALL_FILTER_VALUE ? '' : value)
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-[160px] bg-transparent text-xs">
          <SelectValue placeholder="Ad Account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_FILTER_VALUE}>No ad account</SelectItem>
          {adAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name || account.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {effectivePlatform === 'google' && (
        <Input
          value={loginCustomerId}
          onChange={(event) => onLoginCustomerIdChange(event.target.value)}
          placeholder="MCC / manager ID"
          className="h-8 w-[140px] text-xs"
        />
      )}
    </div>
  );
}
