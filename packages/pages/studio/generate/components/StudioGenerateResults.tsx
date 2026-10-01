'use client';

import { ViewType } from '@genfeedai/contracts';
import type { StudioGenerateResultsProps } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateCard from '@pages/studio/generate/components/StudioGenerateCard';
import type { StudioGenerateJob } from '@pages/studio/generate/types';
import { groupStudioGenerateJobsByRun } from '@pages/studio/generate/utils/studio-generate-recipe';
import Masonry from '@ui/display/masonry/Masonry';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { useTranslations } from 'next-intl';
import { type ReactElement, type ReactNode, useMemo } from 'react';

const RESULTS_SKELETON_SLOTS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
] as const;

function ResultsSkeleton(): ReactElement {
  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
      data-testid="studio-results-skeleton"
    >
      {RESULTS_SKELETON_SLOTS.map((slot) => (
        <Skeleton
          className="aspect-[4/5] w-full rounded-card"
          key={slot}
          variant="rounded"
        />
      ))}
    </div>
  );
}

function ResultsSheet({
  children,
  view,
}: {
  children: ReactNode;
  view: StudioGenerateResultsProps['view'];
}): ReactElement {
  if (view === ViewType.LIST) {
    return (
      <div className="flex flex-col gap-2" data-testid="studio-list">
        {children}
      </div>
    );
  }

  return (
    <Masonry
      className="w-full"
      columns={{ default: 1, lg: 3, md: 3, sm: 2, xl: 4 }}
      gap={12}
    >
      {children}
    </Masonry>
  );
}

/**
 * Everything this brand has generated, newest first — live jobs from the
 * current session merged over the stored library rows so a fresh render never
 * loses the run the operator just kicked off. N outputs from one submit share
 * a run id and render as one group.
 */
export default function StudioGenerateResults({
  assetActions,
  isLoading,
  jobs,
  onReprompt,
  onSelect,
  selectedJobId,
  view,
}: StudioGenerateResultsProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const runs = groupStudioGenerateJobsByRun(jobs);
  const jobsByIngredientId = useMemo(
    () =>
      new Map(
        jobs.flatMap((job: StudioGenerateJob) =>
          job.ingredientId ? [[job.ingredientId, job] as const] : [],
        ),
      ),
    [jobs],
  );

  function renderCard(job: StudioGenerateJob): ReactElement {
    return (
      <StudioGenerateCard
        assetActions={assetActions}
        isSelected={selectedJobId === job.id}
        job={job}
        key={job.id}
        onReprompt={onReprompt}
        onSelect={onSelect}
        parentJob={
          job.parentId ? jobsByIngredientId.get(job.parentId) : undefined
        }
        view={view}
      />
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-results-view={view}
      data-testid="studio-generate-results"
    >
      {jobs.length === 0 ? (
        isLoading ? (
          <ResultsSkeleton />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm text-foreground">{translate('emptyTitle')}</p>
            <p className="text-xs text-muted-foreground">
              {translate('emptyDescription')}
            </p>
          </div>
        )
      ) : view === ViewType.GRID ? (
        <>
          {runs
            .filter((run) => run.jobs.length > 1)
            .map((run) => (
              <span
                className="sr-only"
                data-run-count={run.jobs.length}
                data-testid={`studio-run-${run.id}`}
                key={run.id}
              >
                {translate('runOutputs', { count: run.jobs.length })}
              </span>
            ))}
          <ResultsSheet view={view}>{jobs.map(renderCard)}</ResultsSheet>
        </>
      ) : (
        <div className="flex flex-col gap-6">
          {runs.map((run) => (
            <section
              className="flex flex-col gap-2"
              data-run-count={run.jobs.length}
              data-testid={`studio-run-${run.id}`}
              key={run.id}
            >
              {run.jobs.length > 1 ? (
                <h2 className="text-xs font-medium text-muted-foreground">
                  {translate('runOutputs', { count: run.jobs.length })}
                </h2>
              ) : null}
              <ResultsSheet view={view}>
                {run.jobs.map(renderCard)}
              </ResultsSheet>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
