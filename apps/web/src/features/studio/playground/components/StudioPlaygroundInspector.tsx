'use client';

import { ContextSidebarHeaderSlot } from '@contexts/ui/context-sidebar-context';
import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { ViewOption } from '@genfeedai/props/ui/navigation/view-option.props';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Button } from '@ui/primitives/button';
import { PanelTabs } from '@ui/primitives/tabs';
import { FileText, History, Link2, Maximize2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';
import StudioInspectorActions from '@/features/studio/playground/components/StudioInspectorActions';
import StudioInspectorFacts from '@/features/studio/playground/components/StudioInspectorFacts';
import StudioInspectorHistoryPanel from '@/features/studio/playground/components/StudioInspectorHistoryPanel';
import StudioInspectorPreview from '@/features/studio/playground/components/StudioInspectorPreview';
import StudioInspectorRecipePanel from '@/features/studio/playground/components/StudioInspectorRecipePanel';
import StudioInspectorUsedInPanel from '@/features/studio/playground/components/StudioInspectorUsedInPanel';
import { useStudioInspectorAsset } from '@/features/studio/playground/hooks/useStudioInspectorAsset';
import { useStudioInspectorPreview } from '@/features/studio/playground/hooks/useStudioInspectorPreview';
import { useStudioInspectorRelations } from '@/features/studio/playground/hooks/useStudioInspectorRelations';
import { readStoredPrompt } from '@/features/studio/playground/utils/studio-playground-prompt-slots';
import {
  formatStudioRecipePrompt,
  resolveRecipeForJob,
  studioAssetAccessibleLabel,
} from '@/features/studio/playground/utils/studio-playground-recipe';
import { getStudioPlaygroundTypeConfig } from '@/features/studio/playground/utils/studio-playground-types';
import type { StudioPlaygroundInspectorProps } from '@/features/studio/props/studio-playground.props';
import type { InspectorTab } from '@/features/studio/props/studio-playground-inspector.props';

function isInspectorTab(value: string): value is InspectorTab {
  return value === 'history' || value === 'recipe' || value === 'used-in';
}

/**
 * The asset renderer inside the shell's context sidebar: preview and facts on
 * top, the Recipe / Used in / History section below (picked from a menu in the
 * header), actions pinned to the bottom. Title,
 * model and close live in the sidebar header.
 */
export default function StudioPlaygroundInspector({
  isFocused = false,
  job,
  onOpenPreview,
  onPreviewRecovered,
  onRemove,
  onRemix,
  onEdit,
  onAnimate,
  onOpenInEditor,
  transformActions,
  onSelect,
  onUseAsReference,
  onUseInPost,
  isUseAsReferenceEnabled,
  onVary,
  parentJob,
  runJobs,
}: StudioPlaygroundInspectorProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const { label } = getStudioPlaygroundTypeConfig(job.type);
  const asset = useStudioInspectorAsset({ job, runJobs });
  const {
    continuationJob,
    currentReceipt,
    ingredient,
    ingredientId,
    isSourceUnavailable,
    siblingJobs,
  } = asset;
  const preview = useStudioInspectorPreview({
    currentReceipt,
    ingredient,
    isOwnReceipt: asset.isOwnReceipt,
    isReceiptReadEnabled: asset.isReceiptReadEnabled,
    job,
    onPreviewRecovered,
    refetchReceipt: asset.refetchReceipt,
  });
  const isReady =
    job.status === IngredientStatus.GENERATED ||
    job.status === IngredientStatus.UPLOADED ||
    job.status === IngredientStatus.VALIDATED;
  const recipe = resolveRecipeForJob(continuationJob);
  const recipeText = recipe ? formatStudioRecipePrompt(recipe) : '';
  const promptText = recipeText || job.prompt.trim();
  // The slots and sent text come from the prompt row the receipt read loaded;
  // a list row may carry only the written prompt, which reads as no slots.
  const storedPrompt = readStoredPrompt(
    currentReceipt ?? ingredient,
    job.type,
    recipe?.isAudioEnabled === true,
  );
  const relations = useStudioInspectorRelations(
    ingredientId,
    isSourceUnavailable,
  );
  const [tabSelection, setTabSelection] = useState<{
    jobId: string;
    tab: InspectorTab;
  }>({ jobId: job.id, tab: 'recipe' });
  const activeTab = tabSelection.jobId === job.id ? tabSelection.tab : 'recipe';

  if (isSourceUnavailable) {
    return (
      <p role="status" className="px-4 py-3 text-xs text-muted-foreground">
        {translate('inspector.assetUnavailable')}
      </p>
    );
  }

  const previewNode = (
    <StudioInspectorPreview
      hasPreviewError={preview.hasPreviewError}
      ingredient={ingredient}
      isFocused={isFocused}
      isPreviewLoading={preview.isPreviewLoading}
      isPreviewUnsupported={preview.isPreviewUnsupported}
      isReady={isReady}
      job={continuationJob}
      label={label}
      onMediaMeasured={preview.handleMediaMeasured}
      onPreviewFailed={preview.handlePreviewFailed}
      onPreviewLoaded={preview.handlePreviewLoaded}
      onRetry={preview.handleRetryPreview}
      previewRevision={preview.previewRevision}
      previewScope={preview.previewScope}
      previewUrl={preview.previewUrl}
    />
  );
  const factList = (
    <StudioInspectorFacts
      facts={preview.facts}
      generationCost={asset.generationCost}
      label={label}
    />
  );
  const actions = isReady ? (
    <StudioInspectorActions
      continuationJob={continuationJob}
      ingredient={ingredient}
      isUseAsReferenceEnabled={isUseAsReferenceEnabled}
      job={job}
      label={label}
      onAnimate={onAnimate}
      onEdit={onEdit}
      onOpenInEditor={onOpenInEditor}
      onRemix={onRemix}
      onSelect={onSelect}
      onUseAsReference={onUseAsReference}
      onUseInPost={onUseInPost}
      onVary={onVary}
      parentJob={parentJob}
      transformActions={transformActions}
    />
  ) : null;

  const isFailed = job.status === IngredientStatus.FAILED;
  const tabItems = [
    {
      content: (
        <StudioInspectorRecipePanel
          currentReceipt={currentReceipt}
          onEditSlots={() => onVary(continuationJob)}
          promptText={promptText}
          receiptError={asset.receiptError}
          recipe={recipe}
          storedPrompt={storedPrompt}
        />
      ),
      id: 'recipe',
      isOpen: true,
      label: translate('inspector.recipe'),
    },
    {
      content: (
        <StudioInspectorUsedInPanel
          isLoading={relations.isLoadingUsedIn}
          posts={relations.posts}
        />
      ),
      id: 'used-in',
      isOpen: true,
      label: translate('inspector.usedIn'),
    },
    {
      content: (
        <StudioInspectorHistoryPanel
          childAssets={relations.children}
          isLoading={relations.isLoadingHistory}
          onSelect={onSelect}
          siblingJobs={siblingJobs}
        />
      ),
      id: 'history',
      isOpen: true,
      label: translate('inspector.history'),
    },
  ];
  const handleTabChange = (tab: string) => {
    if (isInspectorTab(tab)) {
      setTabSelection({ jobId: job.id, tab });
    }
  };

  if (isFocused) {
    return (
      <div
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]"
        data-testid="studio-playground-inspector"
      >
        <div className="flex min-w-0 flex-col gap-3">
          {previewNode}
          {factList}
        </div>

        <PanelTabs
          activeTab={activeTab}
          ariaLabel={translate('inspector.title')}
          className="h-auto min-h-[32rem] flex-1"
          footer={actions}
          items={tabItems}
          onTabChange={handleTabChange}
          testId="studio-playground-inspector-tabs"
        />
      </div>
    );
  }

  // In the context sidebar the header owns the controls: the section menu,
  // Preview and Remove sit in the title row, and only the content below
  // scrolls. A failed generation has nothing to preview.
  const sectionOptions: ViewOption<InspectorTab>[] = [
    {
      icon: <FileText />,
      label: translate('inspector.recipe'),
      type: 'recipe',
    },
    {
      icon: <Link2 />,
      label: translate('inspector.usedIn'),
      type: 'used-in',
    },
    {
      icon: <History />,
      label: translate('inspector.history'),
      type: 'history',
    },
  ];
  const activePanel = tabItems.find((item) => item.id === activeTab);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="studio-playground-inspector"
    >
      <ContextSidebarHeaderSlot>
        <ViewMenu
          activeView={activeTab}
          onChange={handleTabChange}
          options={sectionOptions}
          trigger="label"
        />
        {onOpenPreview && !isFailed ? (
          <Button
            ariaLabel={translate('focusedPreview.open')}
            data-testid="studio-open-focused-preview"
            icon={<Maximize2 className="size-4" />}
            onClick={onOpenPreview}
            size={ButtonSize.ICON}
            tooltip={translate('focusedPreview.open')}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
        {onRemove && isFailed ? (
          <Button
            ariaLabel={translate('removeGenerationAria', {
              prompt: studioAssetAccessibleLabel(job),
              type: label,
            })}
            data-testid="studio-remove-generation"
            icon={<Trash2 className="size-4" />}
            label={translate('remove')}
            onClick={() => onRemove(job)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        ) : null}
      </ContextSidebarHeaderSlot>

      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-4">
        {previewNode}
        {factList}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {activePanel?.content}
      </div>
      {actions}
    </div>
  );
}
