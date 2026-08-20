'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  StudioGenerateFilter,
  StudioGenerateResultsProps,
} from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateCard from '@pages/studio/generate/components/StudioGenerateCard';
import { listStudioGenerateTypeConfigs } from '@pages/studio/generate/utils/studio-generate-types';
import { Button } from '@ui/primitives/button';
import Searchbar from '@ui/primitives/searchbar';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

const FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: StudioGenerateFilter;
}> = [
  { label: 'All', value: 'all' },
  ...listStudioGenerateTypeConfigs().map((config) => ({
    label: config.label,
    value: config.type as StudioGenerateFilter,
  })),
];

/**
 * Everything this brand has generated, newest first — live jobs from the
 * current session merged over the stored library rows so a fresh render never
 * loses the run the operator just kicked off.
 */
export default function StudioGenerateResults({
  filter,
  isLoading,
  jobs,
  onFilterChange,
  onReprompt,
  onSearchChange,
  search,
}: StudioGenerateResultsProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_OPTIONS.map((option) => (
            <Button
              className={cn(
                'h-7 rounded-full px-3 text-xs',
                option.value === filter
                  ? 'bg-foreground/[0.08] font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-foreground/[0.04]',
              )}
              key={option.value}
              label={option.label}
              onClick={() => onFilterChange(option.value)}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          ))}
        </div>

        <Searchbar
          className="w-full sm:w-64"
          onChange={(event) => onSearchChange(event.target.value)}
          onClear={() => onSearchChange('')}
          placeholder="Search generations"
          size={ComponentSize.SM}
          value={search}
        />
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          {isLoading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <p className="text-sm text-foreground">
                {translate('emptyTitle')}
              </p>
              <p className="text-xs text-muted-foreground">
                {translate('emptyDescription')}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {jobs.map((job) => (
            <StudioGenerateCard
              job={job}
              key={job.id}
              onReprompt={onReprompt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
