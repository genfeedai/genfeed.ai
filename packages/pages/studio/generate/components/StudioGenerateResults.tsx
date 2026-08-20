'use client';

import type { StudioGenerateResultsProps } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateCard from '@pages/studio/generate/components/StudioGenerateCard';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/**
 * Everything this brand has generated, newest first — live jobs from the
 * current session merged over the stored library rows so a fresh render never
 * loses the run the operator just kicked off.
 */
export default function StudioGenerateResults({
  isLoading,
  jobs,
  onReprompt,
}: StudioGenerateResultsProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');

  return (
    <div className="flex flex-col gap-3">
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
