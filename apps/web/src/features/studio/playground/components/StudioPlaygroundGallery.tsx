'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement, RefObject } from 'react';
import StudioPlaygroundFocusedPreview from '@/features/studio/playground/components/StudioPlaygroundFocusedPreview';
import StudioPlaygroundInspector from '@/features/studio/playground/components/StudioPlaygroundInspector';
import StudioPlaygroundResults from '@/features/studio/playground/components/StudioPlaygroundResults';
import type { UseStudioAssetActionsReturn } from '@/features/studio/playground/hooks/useStudioAssetActions';
import type { UseStudioGalleryViewReturn } from '@/features/studio/playground/hooks/useStudioGalleryView';
import type { UseStudioGenerationReturn } from '@/features/studio/playground/hooks/useStudioGeneration';
import type { UseStudioPlaygroundGalleryReturn } from '@/features/studio/playground/hooks/useStudioPlaygroundGallery';

export interface StudioPlaygroundGalleryProps
  extends Pick<
    UseStudioGalleryViewReturn,
    | 'previewRevisions'
    | 'recoverPreview'
    | 'recoveredJobs'
    | 'resultsView'
    | 'selectedJob'
    | 'selectedJobId'
    | 'selectedParentJob'
    | 'selectedRunJobs'
    | 'showEmptyState'
    | 'visibleJobs'
  > {
  assetActions: UseStudioAssetActionsReturn['assetActions'];
  cancelJob: UseStudioGenerationReturn['cancelJob'];
  canUseGeneratedReference: (job: StudioPlaygroundJob) => boolean;
  composerHeight: number | null;
  galleryError: UseStudioPlaygroundGalleryReturn['galleryError'];
  galleryScrollRef: RefObject<HTMLDivElement | null>;
  handleCloseFocusedPreview: () => void;
  handleEditJob: (job: StudioPlaygroundJob) => void;
  handleRemixJob: (job: StudioPlaygroundJob) => void;
  handleSelectJob: (job: StudioPlaygroundJob) => void;
  handleUseGeneratedReference: (job: StudioPlaygroundJob) => void;
  handleVaryRecipe: (job: StudioPlaygroundJob) => void;
  isFocusedPreview: boolean;
  isLoadingGallery: boolean;
  refresh: () => Promise<void>;
  transformActions: UseStudioAssetActionsReturn['transformActions'];
}

/**
 * The scrolling results area: the focused preview of one asset, or the
 * history with its load error and retry.
 */
export default function StudioPlaygroundGallery({
  assetActions,
  cancelJob,
  canUseGeneratedReference,
  composerHeight,
  galleryError,
  galleryScrollRef,
  handleCloseFocusedPreview,
  handleEditJob,
  handleRemixJob,
  handleSelectJob,
  handleUseGeneratedReference,
  handleVaryRecipe,
  isFocusedPreview,
  isLoadingGallery,
  previewRevisions,
  recoverPreview,
  recoveredJobs,
  refresh,
  resultsView,
  selectedJob,
  selectedJobId,
  selectedParentJob,
  selectedRunJobs,
  showEmptyState,
  transformActions,
  visibleJobs,
}: StudioPlaygroundGalleryProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');

  return (
    <div
      ref={galleryScrollRef}
      tabIndex={-1}
      className="relative z-0 h-full overflow-auto px-3 py-3 pb-40 sm:px-4 sm:py-4"
      style={
        composerHeight === null
          ? undefined
          : { paddingBottom: Math.max(160, composerHeight + 40) }
      }
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        {isFocusedPreview && selectedJob ? (
          <StudioPlaygroundFocusedPreview
            job={selectedJob}
            jobs={visibleJobs}
            onClose={handleCloseFocusedPreview}
            onSelect={handleSelectJob}
          >
            <StudioPlaygroundInspector
              isFocused
              job={selectedJob}
              onRemix={handleRemixJob}
              onEdit={handleEditJob}
              onAnimate={assetActions.onConvertToVideo}
              onOpenInEditor={assetActions.onOpenInEditor}
              transformActions={transformActions}
              onPreviewRecovered={recoverPreview}
              isUseAsReferenceEnabled={canUseGeneratedReference(selectedJob)}
              onSelect={handleSelectJob}
              onUseAsReference={handleUseGeneratedReference}
              onUseInPost={assetActions.onPublishIngredient}
              onVary={handleVaryRecipe}
              parentJob={selectedParentJob}
              runJobs={selectedRunJobs}
            />
          </StudioPlaygroundFocusedPreview>
        ) : (
          <>
            {galleryError ? (
              <Alert role="alert">
                <AlertTitle>
                  {translate(`history.${galleryError}FailedTitle`)}
                </AlertTitle>
                <AlertDescription>
                  <p>{translate(`history.${galleryError}FailedDescription`)}</p>
                  <Button
                    aria-busy={isLoadingGallery}
                    ariaLabel={translate('history.retry')}
                    className="mt-3"
                    disabled={isLoadingGallery}
                    icon={<RotateCcw aria-hidden="true" className="size-4" />}
                    isLoading={isLoadingGallery}
                    onClick={refresh}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  >
                    {translate('history.retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {galleryError && isLoadingGallery ? (
              <p
                aria-live="polite"
                className="text-sm text-muted-foreground"
                role="status"
              >
                {translate('history.retrying')}
              </p>
            ) : null}
            {!showEmptyState && (!galleryError || visibleJobs.length > 0) ? (
              <StudioPlaygroundResults
                assetActions={{
                  ...assetActions,
                  onCancelGeneration: cancelJob,
                }}
                isLoading={isLoadingGallery}
                jobs={recoveredJobs}
                isUseAsReferenceEnabled={canUseGeneratedReference}
                onReprompt={handleVaryRecipe}
                onSelect={handleSelectJob}
                onUseAsReference={handleUseGeneratedReference}
                previewRevisions={previewRevisions}
                selectedJobId={selectedJobId}
                view={resultsView}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
