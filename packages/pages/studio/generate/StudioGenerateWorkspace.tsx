'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { StudioGenerateJob } from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { StudioGenerateFilter } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import { useStudioGenerateGallery } from '@pages/studio/generate/hooks/useStudioGenerateGallery';
import { useStudioGenerateModels } from '@pages/studio/generate/hooks/useStudioGenerateModels';
import { useStudioGenerateSettings } from '@pages/studio/generate/hooks/useStudioGenerateSettings';
import { useStudioGeneration } from '@pages/studio/generate/hooks/useStudioGeneration';
import {
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
} from '@pages/studio/generate/utils/studio-generate-asset';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

/**
 * The Studio playground. One prompt bar generates every asset type Genfeed
 * supports, enriched with the brand's own prompt data, and everything the
 * brand has ever generated sits above it in one grid.
 */
export default function StudioGenerateWorkspace(): ReactElement {
  const { brandId } = useBrand();
  const { resetSettings, settings, setType, type, updateSettings } =
    useStudioGenerateSettings();

  const [prompt, setPrompt] = useState('');
  const [filter, setFilter] = useState<StudioGenerateFilter>('all');
  const [search, setSearch] = useState('');

  const { modelCategory } = getStudioGenerateTypeConfig(type);
  const { isLoadingModels, models } = useStudioGenerateModels(modelCategory);
  const { isLoadingGallery, refresh, storedJobs } = useStudioGenerateGallery({
    brandId,
    filter,
  });

  const { isGenerating, jobs, submit } = useStudioGeneration({
    brandId,
    models,
    onGenerated: refresh,
    settings,
    type,
  });

  const visibleJobs = useMemo(
    () =>
      filterStudioGenerateJobs(mergeStudioGenerateJobs(jobs, storedJobs), {
        search,
        type: filter,
      }),
    [filter, jobs, search, storedJobs],
  );

  const handleSubmit = useCallback(() => {
    void submit(prompt);
  }, [prompt, submit]);

  // Reprompt reloads the composer rather than firing immediately — the
  // operator almost always wants to change one thing before running it again.
  const handleReprompt = useCallback(
    (job: StudioGenerateJob) => {
      setType(job.type);
      setPrompt(job.prompt);
    },
    [setType],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">Generate</h1>
            <p className="text-sm text-muted-foreground">
              One prompt bar for every asset type, enriched with your brand.
            </p>
          </div>

          <StudioGenerateResults
            filter={filter}
            isLoading={isLoadingGallery}
            jobs={visibleJobs}
            onFilterChange={setFilter}
            onReprompt={handleReprompt}
            onSearchChange={setSearch}
            search={search}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <StudioGenerateComposer
            isGenerating={isGenerating}
            isLoadingModels={isLoadingModels}
            models={models}
            onPromptChange={setPrompt}
            onResetSettings={resetSettings}
            onSettingsChange={updateSettings}
            onSubmit={handleSubmit}
            onTypeChange={setType}
            prompt={prompt}
            settings={settings}
            type={type}
          />
        </div>
      </div>
    </div>
  );
}
