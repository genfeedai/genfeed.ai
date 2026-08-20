'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ComponentSize } from '@genfeedai/enums';
import type { StudioGenerateJob } from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { StudioGenerateFilter } from '@genfeedai/props/studio/studio-generate.props';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import StudioRemixRunPanel from '@pages/studio/generate/components/StudioRemixRunPanel';
import { useStudioGenerateGallery } from '@pages/studio/generate/hooks/useStudioGenerateGallery';
import { useStudioGenerateModels } from '@pages/studio/generate/hooks/useStudioGenerateModels';
import { useStudioGenerateSettings } from '@pages/studio/generate/hooks/useStudioGenerateSettings';
import { useStudioGeneration } from '@pages/studio/generate/hooks/useStudioGeneration';
import { useStudioRemixRun } from '@pages/studio/generate/hooks/useStudioRemixRun';
import { StudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import {
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
} from '@pages/studio/generate/utils/studio-generate-asset';
import { listStudioGalleryFilters } from '@pages/studio/generate/utils/studio-generate-gallery';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { buildStudioRemixRunEdits } from '@pages/studio/generate/utils/studio-remix-run';
import Alert from '@ui/feedback/alert/Alert';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import Tabs from '@ui/navigation/tabs/Tabs';
import Searchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  const {
    applyTypeSettings,
    isHydrated,
    resetSettings,
    settings,
    setType,
    type,
    updateSettings,
  } = useStudioGenerateSettings();

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
  const {
    error: remixError,
    run: remixRun,
    start: startRemixRun,
    status: remixStatus,
    submitForReview,
    vary,
  } = useStudioRemixRun();
  const appliedRemixRevisionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isHydrated || !remixRun) {
      return;
    }

    const revisionKey = `${remixRun.id}:${remixRun.revision}`;
    if (appliedRemixRevisionRef.current === revisionKey) {
      return;
    }
    appliedRemixRevisionRef.current = revisionKey;

    const output = remixRun.draft.output;
    setPrompt(remixRun.draft.intent.objective);
    applyTypeSettings(output.kind, {
      aspectRatio: output.aspectRatio,
      ...('durationSeconds' in output
        ? { duration: output.durationSeconds }
        : { duration: undefined }),
      outputs: output.count,
    });
  }, [applyTypeSettings, isHydrated, remixRun]);

  const visibleJobs = useMemo(
    () =>
      filterStudioGenerateJobs(mergeStudioGenerateJobs(jobs, storedJobs), {
        search,
        type: filter,
      }),
    [filter, jobs, search, storedJobs],
  );

  const handleSubmit = useCallback(() => {
    if (remixRun) {
      if (type === 'image' || type === 'video' || type === 'avatar') {
        void startRemixRun(
          buildStudioRemixRunEdits(remixRun, prompt, settings, type),
        );
      }
      return;
    }

    void submit(prompt);
  }, [prompt, remixRun, settings, startRemixRun, submit, type]);

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
          {remixRun ? (
            <StudioRemixRunPanel
              error={remixError}
              isWorking={remixStatus === 'working'}
              onReview={(variantIds) => {
                void submitForReview(variantIds);
              }}
              onVary={() => {
                void vary();
              }}
              run={remixRun}
            />
          ) : remixError ? (
            <Alert type={AlertCategory.ERROR}>{remixError}</Alert>
          ) : null}

          <StudioGenerateResults
            isLoading={isLoadingGallery}
            jobs={visibleJobs}
            onReprompt={handleReprompt}
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-background px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <StudioRemixRunScope
            canSelectAvatar={Boolean(
              remixRun && 'avatarAssetId' in remixRun.draft.identity,
            )}
            isActive={Boolean(remixRun)}
          >
            <StudioGenerateComposer
              isGenerating={isGenerating || remixStatus === 'working'}
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
          </StudioRemixRunScope>
        </div>
      </div>
    </div>
  );
}
