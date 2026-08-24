'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { runAgentApiEffect, useAgentApiService } from '@genfeedai/agent';
import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { AlertCategory, ComponentSize } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import type { StudioGenerateJob } from '@genfeedai/interfaces/studio/studio-generate.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type { StudioGenerateComposerProps } from '@genfeedai/props/studio/studio-generate.props';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import StudioRemixRunPanel from '@pages/studio/generate/components/StudioRemixRunPanel';
import { useStudioGenerateAssetActions } from '@pages/studio/generate/hooks/useStudioGenerateAssetActions';
import { useStudioGenerateGallery } from '@pages/studio/generate/hooks/useStudioGenerateGallery';
import { useStudioGenerateModels } from '@pages/studio/generate/hooks/useStudioGenerateModels';
import { useStudioGenerateSettings } from '@pages/studio/generate/hooks/useStudioGenerateSettings';
import { useStudioGeneration } from '@pages/studio/generate/hooks/useStudioGeneration';
import { useStudioRemixRun } from '@pages/studio/generate/hooks/useStudioRemixRun';
import { StudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import {
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
  resolveStudioAssetUrl,
} from '@pages/studio/generate/utils/studio-generate-asset';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import {
  buildStudioRemixRunEdits,
  getRemixDraftComposerState,
  resolvePairedRemixIdentity,
} from '@pages/studio/generate/utils/studio-remix-run';
import { NotificationsService } from '@services/core/notifications.service';
import type { JSONContent } from '@tiptap/core';
import Alert from '@ui/feedback/alert/Alert';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
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

const STUDIO_REFERENCE_TYPES = ['image/*'];

/**
 * The Studio playground. One prompt bar generates every asset type Genfeed
 * supports, enriched with the brand's own prompt data, and everything the
 * brand has ever generated sits above it in one grid.
 */
export default function StudioGenerateWorkspace(): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { brandId, settings: organizationSettings } = useBrand();
  const agentApiService = useAgentApiService();
  const { extraExtensions, resolveSubmit: resolveCharacterMentions } =
    useStudioCharacterMentions(agentApiService);
  const promptDocumentRef = useRef<JSONContent | null>(null);
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
  const [search, setSearch] = useState('');
  const [isContentLibraryOpen, setIsContentLibraryOpen] = useState(false);
  const [contentReferences, setContentReferences] = useState<
    ContentMentionItem[]
  >([]);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const uploadReference = useCallback(
    async (file: File, onProgress?: (percentage: number) => void) => {
      if (!agentApiService) {
        throw new Error('Workspace media service is unavailable');
      }

      return await runAgentApiEffect(
        agentApiService.uploadAttachmentEffect(file, onProgress),
      );
    },
    [agentApiService],
  );

  const {
    addFiles,
    attachments,
    dragHandlers,
    dragState,
    getCompletedAttachments,
    isUploading,
    removeAttachment,
  } = useAttachments({
    acceptedTypes: STUDIO_REFERENCE_TYPES,
    maxFiles: 4,
    onUpload: uploadReference,
  });

  const { isLoading: isContentLibraryLoading, mentions } =
    useContentMentions(agentApiService);
  const contentLibraryItems = useMemo(
    () => mentions.filter((item) => Boolean(item.thumbnailUrl)),
    [mentions],
  );
  const selectedContentIds = useMemo(
    () => new Set(contentReferences.map((item) => item.id)),
    [contentReferences],
  );

  const appendTranscript = useCallback((transcript: string) => {
    setPrompt((current) =>
      current.trim() ? `${current.trim()} ${transcript}` : transcript,
    );
  }, []);
  const getVoiceToken = useCallback(
    () => agentApiService?.getToken() ?? Promise.resolve(null),
    [agentApiService],
  );
  const {
    isListening,
    isSupported: isVoiceSupported,
    isTranscribing,
    startListening,
    stopListening,
  } = useMicrophoneInput({
    apiBaseUrl: agentApiService?.baseUrl ?? '',
    getToken: getVoiceToken,
    onError: (error) => {
      notificationsService.error('Voice transcription', {
        description: error,
      });
    },
    onTranscript: appendTranscript,
  });

  const { capabilities, modelCategory } = getStudioGenerateTypeConfig(type);
  const { isLoadingModels, models } = useStudioGenerateModels(modelCategory);
  const { isLoadingGallery, refresh, storedJobs } = useStudioGenerateGallery({
    brandId,
    filter: 'all',
  });

  const handleAttachGeneratedReference = useCallback(
    (ingredient: IIngredient, targetType: 'image' | 'video') => {
      const previewUrl = resolveStudioAssetUrl(ingredient);
      if (!previewUrl) {
        notificationsService.info('This asset has no usable preview yet');
        return;
      }

      setContentReferences((current) =>
        current.some((reference) => reference.id === ingredient.id)
          ? current
          : [
              ...current,
              {
                contentTitle:
                  ingredient.metadataLabel ||
                  ingredient.promptText ||
                  'Generated reference',
                contentType: String(ingredient.category),
                id: ingredient.id,
                thumbnailUrl: previewUrl,
              },
            ],
      );
      setType(targetType);
    },
    [notificationsService, setType],
  );
  const { isGenerating, jobs, removeJob, submit } = useStudioGeneration({
    brandId,
    models,
    onGenerated: refresh,
    settings,
    type,
  });
  const {
    error: remixError,
    preparePausedDraft,
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

    const draft = getRemixDraftComposerState(remixRun);
    setPrompt(draft.prompt);
    if (draft.type) {
      applyTypeSettings(draft.type, draft.settings);
      return;
    }
    updateSettings(draft.settings);
  }, [applyTypeSettings, isHydrated, remixRun, updateSettings]);

  const handleResetSettings = useCallback(() => {
    if (!remixRun) {
      resetSettings();
      return;
    }

    const draft = getRemixDraftComposerState(remixRun);
    setPrompt(draft.prompt);
    if (draft.type) {
      applyTypeSettings(draft.type, draft.settings);
      return;
    }
    updateSettings(draft.settings);
  }, [applyTypeSettings, remixRun, resetSettings, updateSettings]);

  const assetActions = useStudioGenerateAssetActions({
    onAttachReference: handleAttachGeneratedReference,
    onDeleted: removeJob,
    onRefresh: refresh,
  });

  const visibleJobs = useMemo(
    () =>
      filterStudioGenerateJobs(mergeStudioGenerateJobs(jobs, storedJobs), {
        search,
        type: 'all',
      }),
    [jobs, search, storedJobs],
  );

  const referenceUrls = useMemo(
    () => [
      ...getCompletedAttachments().map((attachment) => attachment.url),
      ...contentReferences.flatMap((item) =>
        item.thumbnailUrl ? [item.thumbnailUrl] : [],
      ),
    ],
    [contentReferences, getCompletedAttachments],
  );

  const handleSubmit = useCallback(() => {
    if (isUploading || isListening || isTranscribing) {
      return;
    }
    if (remixRun) {
      if (
        remixRun.draft.output.kind === 'copy' ||
        type === 'image' ||
        type === 'video' ||
        type === 'avatar'
      ) {
        void startRemixRun(
          buildStudioRemixRunEdits(
            remixRun,
            prompt,
            settings,
            type,
            contentReferences.map((reference) => reference.id),
          ),
        );
      }
      return;
    }
    const prepared = resolveCharacterMentions({
      document: promptDocumentRef.current,
      existingReferenceIds: referenceUrls,
      text: prompt,
    });
    for (const notice of prepared.notices) {
      notificationsService.warning(notice);
    }
    void submit(prepared.text, prepared.referenceIds);
  }, [
    isListening,
    isTranscribing,
    isUploading,
    notificationsService,
    prompt,
    contentReferences,
    referenceUrls,
    resolveCharacterMentions,
    remixRun,
    settings,
    startRemixRun,
    submit,
    type,
  ]);

  const handleSelectContentReference = useCallback(
    (item: ContentMentionItem) => {
      if (!item.thumbnailUrl) {
        return;
      }
      setContentReferences((current) =>
        current.some((reference) => reference.id === item.id)
          ? current
          : [...current, item],
      );
      setIsContentLibraryOpen(false);
    },
    [],
  );

  const attachedAssets = useMemo<PromptBarAttachedAsset[]>(
    () => [
      ...attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        previewUrl: attachment.previewUrl,
        role: 'reference' as const,
        source: 'upload' as const,
      })),
      ...contentReferences.map((reference) => ({
        id: reference.id,
        kind: 'image' as const,
        name: reference.contentTitle,
        previewUrl: reference.thumbnailUrl,
        role: 'reference' as const,
        source: 'library' as const,
      })),
    ],
    [attachments, contentReferences],
  );

  const handleRemoveAttachedAsset = useCallback<
    StudioGenerateComposerProps['onRemoveAttachedAsset']
  >(
    (assetId) => {
      if (attachments.some((attachment) => attachment.id === assetId)) {
        removeAttachment(assetId);
        return;
      }
      setContentReferences((current) =>
        current.filter((reference) => reference.id !== assetId),
      );
    },
    [attachments, removeAttachment],
  );

  const shouldShowVoiceInput = Boolean(
    agentApiService &&
      organizationSettings?.isVoiceControlEnabled === true &&
      isVoiceSupported &&
      !isGenerating &&
      !isTranscribing &&
      prompt.trim().length === 0,
  );

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
              onPreparePaidDraft={() => {
                const selector = remixRun.sourceSnapshot.selector;
                if (
                  selector.kind !== 'connected_ad' ||
                  selector.platform !== 'meta'
                ) {
                  return;
                }
                void preparePausedDraft({
                  destination: {
                    adAccountId: selector.adAccountId,
                    credentialId: selector.credentialId,
                  },
                });
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
            assetActions={assetActions}
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
        <div {...(capabilities.hasReferences ? dragHandlers : {})}>
          <StudioRemixRunScope
            canSelectAvatar={Boolean(
              remixRun && resolvePairedRemixIdentity(remixRun.draft.identity),
            )}
            isActive={Boolean(remixRun)}
          >
            <StudioGenerateComposer
              attachedAssets={attachedAssets}
              extraExtensions={extraExtensions}
              isDragActive={capabilities.hasReferences && dragState.isActive}
              isGenerating={isGenerating || remixStatus === 'working'}
              isListening={isListening}
              isLoadingModels={isLoadingModels}
              isTranscribing={isTranscribing}
              isUploading={isUploading}
              models={models}
              onAddFiles={addFiles}
              onOpenLibrary={() => setIsContentLibraryOpen(true)}
              onPromptChange={setPrompt}
              onPromptDocumentChange={(document) => {
                promptDocumentRef.current = document;
              }}
              onRemoveAttachedAsset={handleRemoveAttachedAsset}
              onResetSettings={handleResetSettings}
              onSettingsChange={updateSettings}
              onStartListening={startListening}
              onStopListening={stopListening}
              onSubmit={handleSubmit}
              onTypeChange={setType}
              prompt={prompt}
              settings={settings}
              shouldShowVoiceInput={shouldShowVoiceInput}
              type={type}
            />
          </StudioRemixRunScope>
        </div>
      </PromptBarContainer>

      <ContentLibraryPicker
        isLoading={isContentLibraryLoading}
        isOpen={isContentLibraryOpen}
        items={contentLibraryItems}
        onOpenChange={setIsContentLibraryOpen}
        onSelect={handleSelectContentReference}
        selectedIds={selectedContentIds}
      />
    </div>
  );
}
