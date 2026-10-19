'use client';

import PatternCard from '@app-components/performance-lab/PatternCard';
import {
  useAnalyticsToolbar,
  useOptionalAnalyticsContext,
} from '@genfeedai/contexts/analytics/analytics-context';
import { AlertCategory } from '@genfeedai/contracts';
import type {
  ICreativePattern,
  PatternType,
} from '@genfeedai/contracts/interfaces';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { usePatternContext } from '@hooks/data/analytics/use-pattern-context/use-pattern-context';
import { useClientPagination } from '@hooks/data/pagination/use-client-pagination/use-client-pagination';
import type {
  PatternLabFilters,
  PatternLabPageProps,
} from '@props/analytics/performance-lab.props';
import AnalyticsFilterMenu from '@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import Alert from '@ui/feedback/alert/Alert';
import Pagination from '@ui/navigation/pagination/Pagination';
import { FlaskConical } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

const PLATFORM_OPTIONS = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Google Ads', value: 'google_ads' },
] as const;

const PATTERN_TYPE_OPTIONS: Array<{ label: string; value: PatternType }> = [
  { label: 'Hook Formula', value: 'hook_formula' },
  { label: 'CTA Formula', value: 'cta_formula' },
  { label: 'Content Structure', value: 'content_structure' },
  { label: 'Caption Formula', value: 'caption_formula' },
  { label: 'Visual Style', value: 'visual_style' },
];

const SCOPE_OPTIONS = [
  { label: 'Public', value: 'public' },
  { label: 'Private', value: 'private' },
] as const;
const PAGE_SIZE = 12;
const EMPTY_PATTERNS: ICreativePattern[] = [];

const SKELETON_IDS = ['s1', 's2', 's3', 's4', 's5', 's6'];

function PatternCardSkeleton() {
  return (
    <div className="border border-border p-4 animate-pulse space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-24 bg-background-tertiary" />
        <div className="h-5 w-16 bg-background-tertiary" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 bg-background-tertiary" />
        <div className="h-3 w-full bg-background-tertiary" />
      </div>
      <div className="h-12 w-full bg-background-tertiary" />
      <div className="h-2 w-full bg-background-tertiary" />
      <div className="space-y-1">
        <div className="h-3 w-full bg-background-tertiary" />
        <div className="h-3 w-4/5 bg-background-tertiary" />
      </div>
    </div>
  );
}

export default function PatternLabPage({ className }: PatternLabPageProps) {
  const analyticsContext = useOptionalAnalyticsContext();
  const surfaceFilters = analyticsContext?.filters;
  const setSurfaceFilter = analyticsContext?.setFilter;
  const [localPlatform, setLocalPlatform] = useState<string>('');
  const [localPatternType, setLocalPatternType] = useState<PatternType | ''>(
    '',
  );
  const [localScope, setLocalScope] = useState<string>('');
  const platform = surfaceFilters?.platform ?? localPlatform;
  const patternType =
    (surfaceFilters?.patternType as PatternType | undefined) ??
    localPatternType;
  const scope = surfaceFilters?.visibility ?? localScope;

  const filters: PatternLabFilters = {
    patternType: patternType || undefined,
    platform: platform || undefined,
    scope: scope || undefined,
  };

  const { patterns, isLoading, error } = usePatternContext(filters);
  const { currentPage, pageItems, setPage, totalPages } = useClientPagination(
    isLoading || error ? EMPTY_PATTERNS : patterns,
    PAGE_SIZE,
  );

  const handlePlatformChange = useCallback(
    (value: string) => {
      setLocalPlatform(value);
      setSurfaceFilter?.('platform', value || undefined);
    },
    [setSurfaceFilter],
  );

  const handlePatternTypeChange = useCallback(
    (value: PatternType | '') => {
      setLocalPatternType(value);
      setSurfaceFilter?.('patternType', value || undefined);
    },
    [setSurfaceFilter],
  );

  const handleScopeChange = useCallback(
    (value: string) => {
      setLocalScope(value);
      setSurfaceFilter?.('visibility', value || undefined);
    },
    [setSurfaceFilter],
  );

  const toolbar = useMemo(() => {
    const facets: FilterMenuFacet[] = [
      {
        defaultValue: '',
        key: 'platform',
        label: 'Platform',
        onChange: handlePlatformChange,
        options: PLATFORM_OPTIONS,
        selection: 'single',
        value: platform,
      },
      {
        defaultValue: '',
        key: 'patternType',
        label: 'Pattern type',
        onChange: (value) => handlePatternTypeChange(value as PatternType | ''),
        options: PATTERN_TYPE_OPTIONS,
        selection: 'single',
        value: patternType,
      },
      {
        defaultValue: '',
        key: 'scope',
        label: 'Scope',
        onChange: handleScopeChange,
        options: SCOPE_OPTIONS,
        selection: 'single',
        value: scope,
      },
    ];

    return (
      <AnalyticsFilterMenu
        facets={facets}
        onClear={() => {
          handlePlatformChange('');
          handlePatternTypeChange('');
          handleScopeChange('');
        }}
      />
    );
  }, [
    handlePatternTypeChange,
    handlePlatformChange,
    handleScopeChange,
    patternType,
    platform,
    scope,
  ]);

  useAnalyticsToolbar(toolbar);

  return (
    <div className={className}>
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

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SKELETON_IDS.map((id) => (
            <PatternCardSkeleton key={id} />
          ))}
        </div>
      )}

      {!isLoading && !error && patterns.length === 0 && (
        <CardEmptyContent icon={FlaskConical} label="No patterns found" />
      )}

      {!isLoading && !error && patterns.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pageItems.map((pattern) => (
              <PatternCard
                key={`${pattern.patternType}-${pattern.label}`}
                pattern={pattern}
              />
            ))}
          </div>
          <Pagination
            currentPage={currentPage}
            onPageChange={setPage}
            totalItems={patterns.length}
            totalLabel="patterns"
            totalPages={totalPages}
          />
        </div>
      )}
    </div>
  );
}
