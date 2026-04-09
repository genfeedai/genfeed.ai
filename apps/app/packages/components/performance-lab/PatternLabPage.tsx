'use client';

import PatternCard from '@app-components/performance-lab/PatternCard';
import { AlertCategory } from '@genfeedai/enums';
import type { PatternType } from '@genfeedai/interfaces';
import { usePatternContext } from '@hooks/data/analytics/use-pattern-context/use-pattern-context';
import type {
  PatternLabFilters,
  PatternLabPageProps,
} from '@props/analytics/performance-lab.props';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useState } from 'react';
import { HiOutlineBeaker } from 'react-icons/hi2';

const PLATFORM_OPTIONS = [
  { label: 'All Platforms', value: '' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Google Ads', value: 'google_ads' },
] as const;

const PATTERN_TYPE_OPTIONS: Array<{ label: string; value: PatternType | '' }> =
  [
    { label: 'All Types', value: '' },
    { label: 'Hook Formula', value: 'hook_formula' },
    { label: 'CTA Formula', value: 'cta_formula' },
    { label: 'Content Structure', value: 'content_structure' },
    { label: 'Caption Formula', value: 'caption_formula' },
    { label: 'Visual Style', value: 'visual_style' },
  ];

const SCOPE_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Public', value: 'public' },
  { label: 'Private', value: 'private' },
] as const;
const ALL_FILTER_VALUE = '__all__';

const SKELETON_IDS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function PatternCardSkeleton() {
  return (
    <div className="border border-white/[0.08] p-4 animate-pulse space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-24 bg-white/10" />
        <div className="h-5 w-16 bg-white/10" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 bg-white/10" />
        <div className="h-3 w-full bg-white/[0.06]" />
      </div>
      <div className="h-12 w-full bg-white/[0.04]" />
      <div className="h-2 w-full bg-white/[0.06]" />
      <div className="space-y-1">
        <div className="h-3 w-full bg-white/[0.06]" />
        <div className="h-3 w-4/5 bg-white/[0.06]" />
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-foreground/40 uppercase tracking-wider">
        {label}
      </label>
      <Select
        value={value || (ALL_FILTER_VALUE as T)}
        onValueChange={(nextValue) =>
          onChange((nextValue === ALL_FILTER_VALUE ? '' : nextValue) as T)
        }
      >
        <SelectTrigger className="min-w-[140px] bg-background text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem
              key={opt.value || ALL_FILTER_VALUE}
              value={opt.value || ALL_FILTER_VALUE}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function PatternLabPage({ className }: PatternLabPageProps) {
  const [platform, setPlatform] = useState<string>('');
  const [patternType, setPatternType] = useState<PatternType | ''>('');
  const [scope, setScope] = useState<string>('');

  const filters: PatternLabFilters = {
    patternType: patternType || undefined,
    platform: platform || undefined,
    scope: scope || undefined,
  };

  const { patterns, isLoading, error } = usePatternContext(filters);

  const handlePlatformChange = useCallback((value: string) => {
    setPlatform(value);
  }, []);

  const handlePatternTypeChange = useCallback((value: PatternType | '') => {
    setPatternType(value);
  }, []);

  const handleScopeChange = useCallback((value: string) => {
    setScope(value);
  }, []);

  const filterBar = (
    <div className="flex flex-wrap items-end gap-4 mb-6">
      <FilterSelect
        label="Platform"
        options={PLATFORM_OPTIONS}
        value={platform}
        onChange={handlePlatformChange}
      />
      <FilterSelect
        label="Pattern Type"
        options={PATTERN_TYPE_OPTIONS}
        value={patternType}
        onChange={handlePatternTypeChange}
      />
      <FilterSelect
        label="Scope"
        options={SCOPE_OPTIONS}
        value={scope}
        onChange={handleScopeChange}
      />
    </div>
  );

  return (
    <Container
      label="Performance Lab"
      description="Creative patterns from real performance data."
      icon={HiOutlineBeaker}
      className={className}
    >
      {filterBar}

      {/* Error state */}
      {error && !isLoading && (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            <div className="font-medium">Failed to load patterns</div>
            <div className="text-xs text-foreground/70">
              Check your connection and try again.
            </div>
          </div>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SKELETON_IDS.map((id) => (
            <PatternCardSkeleton key={id} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && patterns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 bg-white/[0.04] mb-4">
            <HiOutlineBeaker className="w-8 h-8 text-foreground/30" />
          </div>
          <h3 className="font-medium text-foreground/70 mb-1">
            No patterns found
          </h3>
          <p className="text-sm text-foreground/40 max-w-sm">
            {platform || patternType || scope
              ? 'No patterns match your current filters. Try adjusting the selection.'
              : 'No creative patterns available yet. Patterns are extracted from your performance data.'}
          </p>
        </div>
      )}

      {/* Pattern grid */}
      {!isLoading && !error && patterns.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {patterns.map((pattern) => (
            <PatternCard
              key={`${pattern.patternType}-${pattern.label}`}
              pattern={pattern}
            />
          ))}
        </div>
      )}
    </Container>
  );
}
