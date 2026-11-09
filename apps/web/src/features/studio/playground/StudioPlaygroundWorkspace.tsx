'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentApiService } from '@genfeedai/agent';
import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import { SkillSurface, UploadStatus } from '@genfeedai/contracts';
import { getImageEditMaxSources } from '@genfeedai/contracts/constants';
import type { CreativeAppAgentContext } from '@genfeedai/contracts/interfaces';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useStoryboardEntry } from '@hooks/ui/use-storyboard-entry/use-storyboard-entry';
import { IngredientsService } from '@services/content/ingredients.service';
import { NotificationsService } from '@services/core/notifications.service';
import type { JSONContent } from '@tiptap/core';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { usePromptCommandExtension } from '@/features/studio/components/prompt-editor/use-prompt-command-extension';
import StudioPlaygroundComposer from '@/features/studio/playground/components/StudioPlaygroundComposer';
import StudioPlaygroundComposerNotice from '@/features/studio/playground/components/StudioPlaygroundComposerNotice';
import StudioPlaygroundContentLibrary from '@/features/studio/playground/components/StudioPlaygroundContentLibrary';
import StudioPlaygroundEmptyState from '@/features/studio/playground/components/StudioPlaygroundEmptyState';
import StudioPlaygroundGallery from '@/features/studio/playground/components/StudioPlaygroundGallery';
import StudioPlaygroundInspector from '@/features/studio/playground/components/StudioPlaygroundInspector';
import StudioPlaygroundTopbar from '@/features/studio/playground/components/StudioPlaygroundTopbar';
import { useStudioAssetActions } from '@/features/studio/playground/hooks/useStudioAssetActions';
import { useStudioAttachedAssets } from '@/features/studio/playground/hooks/useStudioAttachedAssets';
import { useStudioAttachmentUploads } from '@/features/studio/playground/hooks/useStudioAttachmentUploads';
import { useStudioComposerContextGroups } from '@/features/studio/playground/hooks/useStudioComposerContextGroups';
import { useStudioComposerState } from '@/features/studio/playground/hooks/useStudioComposerState';
import { useStudioContentReferenceActions } from '@/features/studio/playground/hooks/useStudioContentReferenceActions';
import { useStudioContinuation } from '@/features/studio/playground/hooks/useStudioContinuation';
import { useStudioCrunQuote } from '@/features/studio/playground/hooks/useStudioCrunQuote';
import { useStudioCrunRestore } from '@/features/studio/playground/hooks/useStudioCrunRestore';
import { useStudioDraftSync } from '@/features/studio/playground/hooks/useStudioDraftSync';
import { useStudioEditEntry } from '@/features/studio/playground/hooks/useStudioEditEntry';
import { useStudioGalleryLayout } from '@/features/studio/playground/hooks/useStudioGalleryLayout';
import { useStudioGalleryView } from '@/features/studio/playground/hooks/useStudioGalleryView';
import { useStudioGeneration } from '@/features/studio/playground/hooks/useStudioGeneration';
import { useStudioHandoffPrefill } from '@/features/studio/playground/hooks/useStudioHandoffPrefill';
import { useStudioModelFallbacks } from '@/features/studio/playground/hooks/useStudioModelFallbacks';
import { useStudioMountedRef } from '@/features/studio/playground/hooks/useStudioMountedRef';
import { useStudioPlaygroundGallery } from '@/features/studio/playground/hooks/useStudioPlaygroundGallery';
import { useStudioPlaygroundModels } from '@/features/studio/playground/hooks/useStudioPlaygroundModels';
import { useStudioPlaygroundSettings } from '@/features/studio/playground/hooks/useStudioPlaygroundSettings';
import { useStudioPreviewNavigation } from '@/features/studio/playground/hooks/useStudioPreviewNavigation';
import { useStudioReferenceSanitizer } from '@/features/studio/playground/hooks/useStudioReferenceSanitizer';
import { useStudioReferenceSources } from '@/features/studio/playground/hooks/useStudioReferenceSources';
import { useStudioStarterIdea } from '@/features/studio/playground/hooks/useStudioStarterIdea';
import { useStudioSubmit } from '@/features/studio/playground/hooks/useStudioSubmit';
import { useStudioUploadActions } from '@/features/studio/playground/hooks/useStudioUploadActions';
import { useStudioVoiceInput } from '@/features/studio/playground/hooks/useStudioVoiceInput';
import {
  pickStarterCharacter,
  pickStarterProductReference,
  starterOfferingKind,
} from '@/features/studio/playground/utils/studio-playground-starter-ideas';
import {
  filterStudioPlaygroundModels,
  getStudioPlaygroundTypeConfig,
} from '@/features/studio/playground/utils/studio-playground-types';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';

/**
 * The Studio playground. One prompt bar generates every asset type Genfeed
 * supports, enriched with the brand's own prompt data, and everything the
 * brand has ever generated sits above it in one grid.
 *
 * This component only wires the playground's hooks together and lays out the
 * page; each hook under `./hooks` owns one job (composer state, references,
 * submit, draft, handoff, gallery) and `./components` holds the sections.
 */

/**
 * The playground keeps no projects, so the agent treats every prompt here as
 * a new generation instead of asking which project a change applies to. A
 * module constant keeps the reference stable across renders.
 */
const PLAYGROUND_AGENT_CONTEXT: CreativeAppAgentContext = {
  app: 'playground',
  projects: [],
};

export default function StudioPlaygroundWorkspace(): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const storyboardEntry = useStoryboardEntry();
  const {
    brandId,
    organizationId,
    selectedBrand,
    settings: organizationSettings,
  } = useBrand();
  const [recognizedSkillSlugs, setRecognizedSkillSlugs] = useState<string[]>(
    [],
  );
  useCreativeAppAgentContext(PLAYGROUND_AGENT_CONTEXT);
  const agentApiService = useAgentApiService();
  const {
    extraExtensions: characterMentionExtensions,
    mentions: characterMentions,
    resolveSubmit: resolveCharacterMentions,
  } = useStudioCharacterMentions(agentApiService);
  // Studio's `/` palette: navigation-free, so it carries only the skills the
  // catalog offers on this surface (prompt engineering, model selection, …).
  const {
    extraExtensions: promptCommandExtensions,
    resolveSubmit: resolvePromptCommands,
    setContext: setPromptCommandContext,
  } = usePromptCommandExtension({
    surface: SkillSurface.STUDIO,
    recognizedSkillSlugs,
  });
  // #4716 review P1: the Agent context service (`agentApiService`) is only
  // mounted on the `/agent` route tree — the same wiring gap the P0 handoff
  // fix already worked around. Reference resolution needs a Studio-native
  // client, same pattern as every other Studio ingredient fetch in this file.
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );
  const promptDocumentRef = useRef<JSONContent | null>(null);
  const [quoteDocumentRevision, setQuoteDocumentRevision] = useState(0);
  const {
    applyTypeSettings,
    isHydrated,
    resetSettings,
    restoreSettings,
    settings,
    settingsByType,
    setType,
    type,
    updateSettings,
  } = useStudioPlaygroundSettings();

  const {
    clearCrunRestore,
    crunRestoreEpochRef,
    crunRestoreScope,
    crunRestoreScopeRef,
    crunRestoreStatus,
    focusedScopeKey,
    setCrunRestoreStatus,
  } = useStudioCrunRestore({ brandId, organizationId });
  const {
    composerDockRef,
    composerHeight,
    focusReturnRef,
    focusedScope,
    galleryPositionRef,
    galleryScrollRef,
    setFocusedScope,
  } = useStudioGalleryLayout();
  const {
    agentPromptSeed,
    contentLibraryRole,
    contentReferences,
    documentSeed,
    getAttachmentRole,
    handleKnowledgeSelectionChange,
    hasKnowledgeSelection,
    isContentLibraryOpen,
    knowledgeSelection,
    latestPromptRef,
    pendingRestoredUploadIds,
    prompt,
    restoredAttachments,
    restoredRolesRef,
    setAgentPromptSeed,
    setBrandKnowledgeSelection,
    setContentLibraryRole,
    setContentReferences,
    setDocumentSeed,
    setIsContentLibraryOpen,
    setPendingRestoredUploadIds,
    setPrompt,
    setRestoredAttachments,
    uploadRolesRef,
  } = useStudioComposerState({ brandId });

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const {
    addFiles,
    attachments,
    clearAll: clearAttachments,
    dragHandlers,
    dragState,
    getCompletedAttachments,
    isUploading,
    removeAttachment,
  } = useStudioAttachmentUploads({
    agentApiService,
    restoredAttachments,
    settings,
    type,
  });

  const { isLoading: isContentLibraryLoading, mentions } =
    useContentMentions(agentApiService);
  const selectedContentIds = useMemo(
    () => new Set(contentReferences.map((reference) => reference.item.id)),
    [contentReferences],
  );
  const {
    isListening,
    isTranscribing,
    isVoiceSupported,
    startListening,
    stopListening,
  } = useStudioVoiceInput({ agentApiService, notificationsService, setPrompt });

  const { capabilities, modelCategory } = getStudioPlaygroundTypeConfig(type);
  const {
    isLoadingModels,
    isModelCatalogReady,
    models: catalogModels,
  } = useStudioPlaygroundModels(modelCategory, organizationId);
  const models = useMemo(
    () => filterStudioPlaygroundModels(type, catalogModels, settings.avatarRef),
    [catalogModels, settings.avatarRef, type],
  );
  const editSourceLimit = getImageEditMaxSources(
    models.find((model) => model.key === settings.modelKey)?.key ??
      models.find((model) => model.isDefault)?.key,
  );
  const { galleryError, isLoadingGallery, refresh, storedJobs } =
    useStudioPlaygroundGallery({
      brandId,
      filter: 'all',
    });
  const isMountedRef = useStudioMountedRef();

  const {
    handleAttachGeneratedReference,
    handleEditJob,
    handleVaryRecipe,
    isDraftLoadedRef,
    prepareContinuation,
  } = useStudioContinuation({
    applyTypeSettings,
    attachments,
    brandId,
    clearAttachments,
    clearCrunRestore,
    contentReferences,
    crunRestoreEpochRef,
    crunRestoreScopeRef,
    getIngredientsService,
    isMountedRef,
    knowledgeSelection,
    models,
    notificationsService,
    organizationId,
    prompt,
    promptDocumentRef,
    restoredAttachments,
    restoredRolesRef,
    setContentReferences,
    setCrunRestoreStatus,
    setDocumentSeed,
    setPrompt,
    setRestoredAttachments,
    setType,
    settings,
    translate,
    type,
  });
  const { cancelJob, jobs, rehydratePending, removeJob, submit } =
    useStudioGeneration({
      brandId,
      models,
      onGenerated: refresh,
      settings,
      type,
    });
  const { handoffPayload, isHandoffAccepted, isHandoffLoading } =
    useStudioHandoffPrefill({
      applyTypeSettings,
      brandId,
      getIngredientsService,
      isHydrated,
      isLoadingModels,
      isMountedRef,
      models,
      notificationsService,
      organizationId,
      setContentReferences,
      setPrompt,
      setRecognizedSkillSlugs,
      type,
      updateSettings,
    });
  useStudioModelFallbacks({
    capabilities,
    handoffPayload,
    isModelCatalogReady,
    models,
    notificationsService,
    settings,
    type,
    updateSettings,
  });

  const {
    audioLibrary,
    clearFilters,
    contentLibraryItems,
    failedRecovery,
    previewRevisions,
    recoverPreview,
    recoveredJobs,
    resultSort,
    resultType,
    resultsView,
    search,
    selectedJob,
    selectedJobId,
    selectedParentJob,
    selectedRunJobs,
    setResultSort,
    setResultType,
    setResultsView,
    setSearch,
    setSelectedJobId,
    showEmptyState,
    visibleJobs,
  } = useStudioGalleryView({
    brandId,
    contentLibraryRole,
    galleryError,
    getIngredientsService,
    isContentLibraryOpen,
    isLoadingGallery,
    jobs,
    mentions,
    organizationId,
    refresh,
    rehydratePending,
    settings,
    storedJobs,
    type,
  });
  const starterOffering = starterOfferingKind(selectedBrand);
  const {
    assetActions,
    revealInspector,
    transformActions,
    transformConfirmation,
  } = useStudioAssetActions({
    brandId,
    crunRestoreScope,
    failedRecovery,
    handleAttachGeneratedReference,
    organizationId,
    refresh,
    removeJob,
    selectedJobId,
    setSelectedJobId,
    visibleJobs,
  });

  const isFocusedPreview =
    focusedScope === focusedScopeKey && Boolean(selectedJob);

  const {
    attachedReferenceSources,
    composerExtensions,
    referenceMentions,
    referenceOrderRef,
    referenceValidation,
    resolvedReferences,
  } = useStudioReferenceSources({
    attachments,
    characterMentionExtensions,
    characterMentions,
    contentReferences,
    getAttachmentRole,
    getCompletedAttachments,
    pendingRestoredUploadIds,
    prompt,
    promptCommandExtensions,
    promptDocumentRef,
    quoteDocumentRevision,
    restoredAttachments,
    settings,
    type,
    updateSettings,
  });
  const handleStarterIdea = useStudioStarterIdea({
    brandId,
    setAgentPromptSeed,
    setContentLibraryRole,
    setContentReferences,
    setDocumentSeed,
    setIsContentLibraryOpen,
    setType,
  });
  const {
    crunModel,
    crunPreparedIntent,
    crunQuote,
    crunRequest,
    crunVideoRequest,
  } = useStudioCrunQuote({
    brandId,
    characterMentions,
    crunRestoreStatus,
    hasKnowledgeSelection,
    isUploading,
    knowledgeSelection,
    models,
    prompt,
    promptDocumentRef,
    quoteDocumentRevision,
    referenceValidation,
    resolveCharacterMentions,
    resolvePromptCommands,
    resolvedReferences,
    settings,
    type,
  });
  const {
    handleStopGeneration,
    handleSubmit,
    isSubmitting,
    referencePreviewUrlRef,
    stoppableJobs,
  } = useStudioSubmit({
    agentPromptSeed,
    attachedReferenceSources,
    cancelJob,
    clearAttachments,
    crunModel,
    crunQuote,
    crunRequest,
    crunRestoreStatus,
    crunVideoRequest,
    handoffPayload,
    hasKnowledgeSelection,
    isHandoffAccepted,
    isListening,
    isTranscribing,
    isUploading,
    jobs,
    knowledgeSelection,
    latestPromptRef,
    notificationsService,
    prompt,
    promptDocumentRef,
    referenceMentions,
    resolveCharacterMentions,
    resolvePromptCommands,
    resolvedReferences,
    restoredRolesRef,
    setAgentPromptSeed,
    setContentReferences,
    setPendingRestoredUploadIds,
    setPrompt,
    setRestoredAttachments,
    submit,
    type,
  });
  const {
    canUseGeneratedReference,
    handleOpenLibrary,
    handleSelectContentReference,
    handleUseGeneratedReference,
  } = useStudioContentReferenceActions({
    attachments,
    clearCrunRestore,
    contentLibraryRole,
    contentReferences,
    editSourceLimit,
    getAttachmentRole,
    models,
    notificationsService,
    removeAttachment,
    setContentLibraryRole,
    setContentReferences,
    setIsContentLibraryOpen,
    settings,
    translate,
    type,
    updateSettings,
  });
  const handleAddFiles = useStudioUploadActions({
    addFiles,
    attachments,
    clearCrunRestore,
    contentReferences,
    editSourceLimit,
    getAttachmentRole,
    models,
    notificationsService,
    removeAttachment,
    setContentReferences,
    settings,
    translate,
    type,
    updateSettings,
    uploadRolesRef,
  });
  useStudioReferenceSanitizer({
    attachments,
    contentReferences,
    getAttachmentRole,
    isLoadingModels,
    models,
    notificationsService,
    pendingRestoredUploadIds,
    removeAttachment,
    setContentReferences,
    setPendingRestoredUploadIds,
    settings,
    type,
  });
  const { attachedAssets, handleRemoveAttachedAsset, resolveAttachmentRole } =
    useStudioAttachedAssets({
      attachments,
      clearCrunRestore,
      contentReferences,
      getAttachmentRole,
      referencePreviewUrlRef,
      removeAttachment,
      setContentReferences,
      settings,
      type,
    });
  // A Library edit entry waits for the saved draft instead of blocking its
  // restore, so replacing that draft goes through Replace draft / Cancel.
  const { draftSaveStatus, isDraftLoaded } = useStudioDraftSync({
    attachedReferenceSources,
    attachments,
    brandId,
    contentReferences,
    getIngredientsService,
    handoffPayload,
    isDraftLoadedRef,
    isHandoffLoading,
    isHydrated,
    knowledgeSelection,
    prompt,
    referenceOrderRef,
    resolveAttachmentRole,
    restoreSettings,
    restoredRolesRef,
    setBrandKnowledgeSelection,
    setContentReferences,
    setPendingRestoredUploadIds,
    setPrompt,
    setRestoredAttachments,
    settingsByType,
    type,
  });
  useStudioEditEntry({
    applyTypeSettings,
    brandId,
    clearAttachments,
    clearCrunRestore,
    crunRestoreEpochRef,
    crunRestoreScopeRef,
    getIngredientsService,
    isDraftLoaded,
    isHydrated,
    isMountedRef,
    notificationsService,
    prepareContinuation,
    restoredRolesRef,
    setContentReferences,
    setPrompt,
    setRestoredAttachments,
    setType,
    translate,
  });

  const isVoiceInputAvailable = Boolean(
    agentApiService &&
      organizationSettings?.isVoiceControlEnabled === true &&
      isVoiceSupported,
  );

  const {
    handleCloseFocusedPreview,
    handleCloseInspector,
    handleOpenFocusedPreview,
    handleRemixJob,
    handleSelectJob,
  } = useStudioPreviewNavigation({
    focusReturnRef,
    focusedScopeKey,
    galleryPositionRef,
    galleryScrollRef,
    handleAttachGeneratedReference,
    revealInspector,
    selectedJobId,
    setFocusedScope,
    setSelectedJobId,
  });
  const composerContextGroups = useStudioComposerContextGroups({
    assetActions,
    canUseGeneratedReference,
    handleCloseInspector,
    handleOpenFocusedPreview,
    handleRemixJob,
    handleUseGeneratedReference,
    isFocusedPreview,
    selectedJob,
    translate,
    type,
    visibleJobs,
  });

  const remixableVideos = attachments.filter(
    (attachment: AttachmentItem) =>
      attachment.kind === 'video' &&
      attachment.status === UploadStatus.COMPLETED &&
      attachment.ingredientId,
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MasonryConfirmBridge key={crunRestoreScope} {...transformConfirmation} />
      <StudioPlaygroundTopbar
        clearFilters={clearFilters}
        isLoadingGallery={isLoadingGallery}
        refresh={refresh}
        resultSort={resultSort}
        resultType={resultType}
        resultsView={resultsView}
        search={search}
        setResultSort={setResultSort}
        setResultType={setResultType}
        setResultsView={setResultsView}
        setSearch={setSearch}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <StudioPlaygroundGallery
            assetActions={assetActions}
            cancelJob={cancelJob}
            canUseGeneratedReference={canUseGeneratedReference}
            composerHeight={composerHeight}
            galleryError={galleryError}
            galleryScrollRef={galleryScrollRef}
            handleCloseFocusedPreview={handleCloseFocusedPreview}
            handleEditJob={handleEditJob}
            handleRemixJob={handleRemixJob}
            handleSelectJob={handleSelectJob}
            handleUseGeneratedReference={handleUseGeneratedReference}
            handleVaryRecipe={handleVaryRecipe}
            isFocusedPreview={isFocusedPreview}
            isLoadingGallery={isLoadingGallery}
            previewRevisions={previewRevisions}
            recoverPreview={recoverPreview}
            recoveredJobs={recoveredJobs}
            refresh={refresh}
            resultsView={resultsView}
            selectedJob={selectedJob}
            selectedJobId={selectedJobId}
            selectedParentJob={selectedParentJob}
            selectedRunJobs={selectedRunJobs}
            showEmptyState={showEmptyState}
            transformActions={transformActions}
            visibleJobs={visibleJobs}
          />
          {showEmptyState && !isFocusedPreview ? (
            <StudioPlaygroundEmptyState
              brandId={brandId || undefined}
              character={pickStarterCharacter(characterMentions)}
              offeringKind={starterOffering}
              onSelect={handleStarterIdea}
              productReference={pickStarterProductReference(
                selectedBrand?.references,
              )}
              type={type}
            />
          ) : null}
          <PromptBarContainer
            className="px-5 pb-5"
            layoutMode="surface-fixed"
            maxWidth="4xl"
            zIndex={40}
          >
            <div
              ref={composerDockRef}
              {...(capabilities.hasReferences ? dragHandlers : {})}
            >
              <StudioPlaygroundComposer
                notice={
                  referenceValidation.errors.length > 0 ||
                  (prompt.trim() &&
                    referenceValidation.unusedTokens.length > 0) ||
                  draftSaveStatus === 'error' ||
                  draftSaveStatus === 'failed' ||
                  crunRestoreStatus === 'failed' ||
                  remixableVideos.length > 0 ? (
                    <StudioPlaygroundComposerNotice
                      crunRestoreStatus={crunRestoreStatus}
                      draftSaveStatus={draftSaveStatus}
                      onRemixVideo={(assetId) => {
                        void storyboardEntry.createFromUploadAssetId(assetId);
                      }}
                      prompt={prompt}
                      referenceValidation={referenceValidation}
                      remixableVideos={remixableVideos}
                    />
                  ) : null
                }
                attachedAssets={attachedAssets}
                contextGroups={composerContextGroups}
                crunQuote={crunModel ? crunQuote : undefined}
                isCrunRestoreBlocked={Boolean(crunRestoreStatus)}
                isPromptInvalid={referenceValidation.errors.length > 0}
                crunReferenceCount={crunPreparedIntent.referenceIds.length}
                crunStartFrameId={crunPreparedIntent.referenceIds[0]}
                crunEndFrameId={resolvedReferences.endFrameId}
                documentSeed={documentSeed}
                extraExtensions={composerExtensions}
                isDragActive={capabilities.hasReferences && dragState.isActive}
                isListening={isListening}
                isLoadingModels={isLoadingModels}
                isTranscribing={isTranscribing}
                isUploading={isUploading}
                models={models}
                onAddFiles={handleAddFiles}
                onOpenLibrary={handleOpenLibrary}
                onPromptCommandContextChange={setPromptCommandContext}
                onPromptChange={(value) => {
                  clearCrunRestore();
                  setPrompt(value);
                }}
                onPromptDocumentChange={(document) => {
                  promptDocumentRef.current = document;
                  setQuoteDocumentRevision((value) => value + 1);
                }}
                onRemoveAttachedAsset={handleRemoveAttachedAsset}
                onResetSettings={() => {
                  clearCrunRestore();
                  resetSettings();
                }}
                onSettingsChange={(patch) => {
                  if (
                    patch.modelKey !== undefined &&
                    patch.modelKey !== settings.modelKey
                  )
                    clearCrunRestore();
                  updateSettings(patch);
                }}
                isStopAvailable={stoppableJobs.length > 0}
                isSubmitting={isSubmitting}
                onStartListening={startListening}
                onStopGeneration={handleStopGeneration}
                onStopListening={stopListening}
                onSubmit={handleSubmit}
                onTypeChange={(value) => {
                  clearCrunRestore();
                  setType(value);
                }}
                prompt={prompt}
                settings={settings}
                isVoiceInputAvailable={isVoiceInputAvailable}
                type={type}
              />
            </div>
          </PromptBarContainer>
        </div>
      </div>

      <ContextSidebarPanel
        onClose={handleCloseInspector}
        selection={
          selectedJob && !isFocusedPreview
            ? {
                id: selectedJob.id,
                kind: 'asset',
                // Card clicks, See Details and run-sibling picks select a job.
                origin: 'user',
                subtitle:
                  selectedJob.modelKey || translate('inspector.autoModel'),
                title: getStudioPlaygroundTypeConfig(selectedJob.type).label,
              }
            : null
        }
      >
        {selectedJob && !isFocusedPreview ? (
          <StudioPlaygroundInspector
            job={selectedJob}
            onOpenPreview={handleOpenFocusedPreview}
            onPreviewRecovered={recoverPreview}
            onRemove={assetActions.onRemoveGeneration}
            onRemix={handleRemixJob}
            onEdit={handleEditJob}
            onAnimate={assetActions.onConvertToVideo}
            onOpenInEditor={assetActions.onOpenInEditor}
            transformActions={transformActions}
            isUseAsReferenceEnabled={canUseGeneratedReference(selectedJob)}
            onSelect={handleSelectJob}
            onUseAsReference={handleUseGeneratedReference}
            onUseInPost={assetActions.onPublishIngredient}
            onVary={handleVaryRecipe}
            parentJob={selectedParentJob}
            runJobs={selectedRunJobs}
          />
        ) : null}
      </ContextSidebarPanel>

      <StudioPlaygroundContentLibrary
        audioLibrary={audioLibrary}
        brandId={brandId}
        contentLibraryItems={contentLibraryItems}
        contentLibraryRole={contentLibraryRole}
        handleKnowledgeSelectionChange={handleKnowledgeSelectionChange}
        handleSelectContentReference={handleSelectContentReference}
        isContentLibraryLoading={isContentLibraryLoading}
        isContentLibraryOpen={isContentLibraryOpen}
        isLoadingGallery={isLoadingGallery}
        knowledgeSelection={knowledgeSelection}
        selectedContentIds={selectedContentIds}
        setIsContentLibraryOpen={setIsContentLibraryOpen}
        type={type}
      />
    </div>
  );
}
