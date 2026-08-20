'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ComponentSize } from '@genfeedai/enums';
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
import { listStudioGalleryFilters } from '@pages/studio/generate/utils/studio-generate-gallery';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import Tabs from '@ui/navigation/tabs/Tabs';
import Searchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

const FILTER_TABS = listStudioGalleryFilters().map((id) => ({
  id,
  label: id === 'all' ? 'All' : getStudioGenerateTypeConfig(id).label,
}));

/**
 * The Studio playground. One prompt bar generates every asset type Genfeed
 * supports, enriched with the brand's own prompt data, and everything the
 * brand has ever generated sits above it in one grid.
 */
export default function StudioGenerateWorkspace(): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
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

  const handleFilterChange = useCallback((value: string) => {
    const selectedFilter = FILTER_TABS.find((option) => option.id === value);
    if (selectedFilter) {
      setFilter(selectedFilter.id);
    }
  }, []);

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
      <SectionTopbar
        actions={
          <Searchbar
            className="w-64"
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search generations"
            size={ComponentSize.SM}
            value={search}
          />
        }
        subtitle={translate('description')}
        tabs={
          <Tabs
            activeTab={filter}
            fullWidth={false}
            items={FILTER_TABS}
            onTabChange={handleFilterChange}
            size="sm"
            variant="default"
          />
        }
        title={translate('title')}
      />

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <StudioGenerateResults
            isLoading={isLoadingGallery}
            jobs={visibleJobs}
            onReprompt={handleReprompt}
          />
        </div>
      </div>

      <PromptBarContainer
        className="shrink-0 bg-background px-5 pb-5 pt-3"
        layoutMode="inflow"
        maxWidth="4xl"
        showTopFade
      >
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
      </PromptBarContainer>
    </div>
  );
}
