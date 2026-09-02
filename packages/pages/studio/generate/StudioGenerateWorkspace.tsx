'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { runAgentApiEffect, useAgentApiService } from '@genfeedai/agent';
import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import { AlertCategory, ComponentSize, ViewType } from '@genfeedai/contracts';
import {
  getModelMaxVideoReferences,
  hasEndFrame,
  hasInterpolation,
  hasVideoReferences,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateJob } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type {
  StudioGenerateComposerProps,
  StudioGenerateReferenceRole,
} from '@genfeedai/props/studio/studio-generate.props';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import StudioGenerateInspector from '@pages/studio/generate/components/StudioGenerateInspector';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import StudioRemixRunPanel from '@pages/studio/generate/components/StudioRemixRunPanel';
import { useStudioGenerateAssetActions } from '@pages/studio/generate/hooks/useStudioGenerateAssetActions';
import { useStudioGenerateGallery } from '@pages/studio/generate/hooks/useStudioGenerateGallery';
import { useStudioGenerateModels } from '@pages/studio/generate/hooks/useStudioGenerateModels';
import { useStudioGenerateSettings } from '@pages/studio/generate/hooks/useStudioGenerateSettings';
import { useStudioGeneration } from '@pages/studio/generate/hooks/useStudioGeneration';
import { useStudioRemixRun } from '@pages/studio/generate/hooks/useStudioRemixRun';
import { StudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import { buildRepromptData } from '@pages/studio/generate/utils/generation-payloads';
import {
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
  resolveStudioAssetUrl,
} from '@pages/studio/generate/utils/studio-generate-asset';
import {
  groupStudioGenerateJobsByRun,
  recipeFromRepromptData,
  settingsPatchFromRecipe,
} from '@pages/studio/generate/utils/studio-generate-recipe';
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
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import Searchbar from '@ui/primitives/searchbar';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const STUDIO_REFERENCE_TYPES = ['image/*', 'video/*'];

interface StudioContentReference {
  item: ContentMentionItem;
  role: StudioGenerateReferenceRole;
}

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
  const [resultsView, setResultsView] = useState<ViewType.GRID | ViewType.LIST>(
    ViewType.GRID,
  );
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isContentLibraryOpen, setIsContentLibraryOpen] = useState(false);
  const [contentLibraryRole, setContentLibraryRole] =
    useState<StudioGenerateReferenceRole>('reference');
  const [contentReferences, setContentReferences] = useState<
    StudioContentReference[]
  >([]);
  const uploadRolesRef = useRef(
    new WeakMap<File, StudioGenerateReferenceRole>(),
  );

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
    maxFiles: 8,
    onUpload: uploadReference,
  });

  const { isLoading: isContentLibraryLoading, mentions } =
    useContentMentions(agentApiService);
  const contentLibraryItems = useMemo(() => {
    const requiresVideo = contentLibraryRole === 'videoReference';
    return mentions.filter((item) => {
      if (!item.thumbnailUrl) {
        return false;
      }
      const isVideo = item.contentType.toLowerCase().includes('video');
      return requiresVideo ? isVideo : !isVideo;
    });
  }, [contentLibraryRole, mentions]);
  const selectedContentIds = useMemo(
    () => new Set(contentReferences.map((reference) => reference.item.id)),
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
        current.some((reference) => reference.item.id === ingredient.id)
          ? current
          : [
              ...current,
              {
                item: {
                  contentTitle:
                    ingredient.metadataLabel ||
                    ingredient.promptText ||
                    'Generated reference',
                  contentType: String(ingredient.category),
                  id: ingredient.id,
                  thumbnailUrl: previewUrl,
                },
                role: targetType === 'video' ? 'startFrame' : 'reference',
              },
            ],
      );
      setType(targetType);
    },
    [notificationsService, setType],
  );
  const { isGenerating, jobs, rehydratePending, removeJob, submit } =
    useStudioGeneration({
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

  useEffect(() => {
    rehydratePending(storedJobs);
  }, [rehydratePending, storedJobs]);

  const visibleJobs = useMemo(
    () =>
      filterStudioGenerateJobs(mergeStudioGenerateJobs(jobs, storedJobs), {
        search,
        type: 'all',
      }),
    [jobs, search, storedJobs],
  );
  const selectedJob = useMemo(
    () => visibleJobs.find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId, visibleJobs],
  );
  const selectedRunJobs = useMemo(() => {
    if (!selectedJob) {
      return [];
    }

    const runId = selectedJob.runId;
    if (!runId) {
      return [selectedJob];
    }

    return (
      groupStudioGenerateJobsByRun(visibleJobs).find((run) => run.id === runId)
        ?.jobs ?? [selectedJob]
    );
  }, [selectedJob, visibleJobs]);

  useEffect(() => {
    if (selectedJobId && !selectedJob) {
      setSelectedJobId(null);
    }
  }, [selectedJob, selectedJobId]);

  const resolvedReferences = useMemo(() => {
    const entries = [
      ...getCompletedAttachments().map((completed) => {
        const attachment = attachments.find(
          (candidate) => candidate.ingredientId === completed.ingredientId,
        );
        const explicitRole = attachment?.file
          ? uploadRolesRef.current.get(attachment.file)
          : undefined;
        const role: StudioGenerateReferenceRole =
          explicitRole ??
          (type === 'video'
            ? completed.kind === 'video'
              ? 'videoReference'
              : 'startFrame'
            : 'reference');
        return { id: completed.ingredientId, role };
      }),
      ...contentReferences.map((reference) => ({
        id: reference.item.id,
        role: reference.role,
      })),
    ];

    return {
      endFrameId: entries.find((entry) => entry.role === 'endFrame')?.id,
      imageReferenceIds: entries
        .filter(
          (entry) => entry.role === 'reference' || entry.role === 'startFrame',
        )
        .map((entry) => entry.id),
      videoReferenceIds: entries
        .filter((entry) => entry.role === 'videoReference')
        .map((entry) => entry.id),
    };
  }, [attachments, contentReferences, getCompletedAttachments, type]);

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
            contentReferences.map((reference) => reference.item.id),
          ),
        );
      }
      return;
    }
    const prepared = resolveCharacterMentions({
      document: promptDocumentRef.current,
      existingReferenceIds: resolvedReferences.imageReferenceIds,
      text: prompt,
    });
    for (const notice of prepared.notices) {
      notificationsService.warning(notice);
    }
    void submit(prepared.text, {
      ...resolvedReferences,
      imageReferenceIds: prepared.referenceIds,
    });
  }, [
    isListening,
    isTranscribing,
    isUploading,
    notificationsService,
    prompt,
    contentReferences,
    resolvedReferences,
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
      const supportsInterpolation = hasInterpolation(settings.modelKey);
      const hasStartFrame =
        contentReferences.some(
          (reference) => reference.role === 'startFrame',
        ) ||
        attachments.some(
          (attachment) =>
            attachment.file &&
            uploadRolesRef.current.get(attachment.file) === 'startFrame',
        );
      if (
        contentLibraryRole === 'endFrame' &&
        supportsInterpolation &&
        !hasStartFrame
      ) {
        notificationsService.warning(
          'Choose a Start Frame before the End Frame.',
        );
        return;
      }
      if (
        contentLibraryRole === 'videoReference' &&
        !contentReferences.some((reference) => reference.item.id === item.id)
      ) {
        const selectedVideoReferences =
          contentReferences.filter(
            (reference) => reference.role === 'videoReference',
          ).length +
          attachments.filter(
            (attachment) =>
              attachment.file &&
              uploadRolesRef.current.get(attachment.file) === 'videoReference',
          ).length;
        const maxVideoReferences = getModelMaxVideoReferences(
          settings.modelKey,
        );
        if (selectedVideoReferences >= maxVideoReferences) {
          notificationsService.warning(
            `The selected model accepts at most ${maxVideoReferences} video references.`,
          );
          return;
        }
      }
      setContentReferences((current) =>
        current.some((reference) => reference.item.id === item.id)
          ? current
          : contentLibraryRole === 'endFrame' ||
              contentLibraryRole === 'startFrame'
            ? [
                ...current.filter(
                  (reference) =>
                    reference.role !== contentLibraryRole &&
                    (supportsInterpolation ||
                      (reference.role !== 'startFrame' &&
                        reference.role !== 'endFrame')),
                ),
                { item, role: contentLibraryRole },
              ]
            : [...current, { item, role: contentLibraryRole }],
      );
      if (
        contentLibraryRole === 'videoReference' &&
        settings.modelKey ===
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
        settings.resolution === '4k'
      ) {
        updateSettings({ resolution: 'pro' });
        notificationsService.warning(
          'Kling Omni video references use Pro quality; 4K is not compatible.',
        );
      }
      setIsContentLibraryOpen(false);
    },
    [
      attachments,
      contentLibraryRole,
      contentReferences,
      notificationsService,
      settings.modelKey,
      settings.resolution,
      updateSettings,
    ],
  );

  const handleAddFiles = useCallback<StudioGenerateComposerProps['onAddFiles']>(
    (files, role = 'reference') => {
      const supportsInterpolation = hasInterpolation(settings.modelKey);
      const hasStartFrame =
        contentReferences.some(
          (reference) => reference.role === 'startFrame',
        ) ||
        attachments.some(
          (attachment) =>
            attachment.file &&
            uploadRolesRef.current.get(attachment.file) === 'startFrame',
        );
      if (role === 'endFrame' && supportsInterpolation && !hasStartFrame) {
        notificationsService.warning(
          'Choose a Start Frame before the End Frame.',
        );
        return;
      }
      if (role === 'endFrame' || role === 'startFrame') {
        setContentReferences((current) =>
          current.filter(
            (reference) =>
              reference.role !== role &&
              (supportsInterpolation ||
                (reference.role !== 'startFrame' &&
                  reference.role !== 'endFrame')),
          ),
        );
        for (const attachment of attachments) {
          const attachmentRole = attachment.file
            ? uploadRolesRef.current.get(attachment.file)
            : undefined;
          if (
            attachmentRole === role ||
            (!supportsInterpolation &&
              (attachmentRole === 'startFrame' ||
                attachmentRole === 'endFrame'))
          ) {
            removeAttachment(attachment.id);
          }
        }
      }
      let acceptedFiles = files;
      if (role === 'videoReference') {
        const selectedVideoReferences =
          contentReferences.filter(
            (reference) => reference.role === 'videoReference',
          ).length +
          attachments.filter(
            (attachment) =>
              attachment.file &&
              uploadRolesRef.current.get(attachment.file) === 'videoReference',
          ).length;
        const maxVideoReferences = getModelMaxVideoReferences(
          settings.modelKey,
        );
        const remaining = Math.max(
          0,
          maxVideoReferences - selectedVideoReferences,
        );
        acceptedFiles = files.slice(0, remaining);
        if (acceptedFiles.length < files.length) {
          notificationsService.warning(
            `The selected model accepts at most ${maxVideoReferences} video references.`,
          );
        }
      }
      for (const file of acceptedFiles) {
        uploadRolesRef.current.set(file, role);
      }
      if (
        role === 'videoReference' &&
        settings.modelKey ===
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
        settings.resolution === '4k'
      ) {
        updateSettings({ resolution: 'pro' });
        notificationsService.warning(
          'Kling Omni video references use Pro quality; 4K is not compatible.',
        );
      }
      if (acceptedFiles.length > 0) {
        addFiles(acceptedFiles);
      }
    },
    [
      addFiles,
      attachments,
      contentReferences,
      notificationsService,
      removeAttachment,
      settings.modelKey,
      settings.resolution,
      updateSettings,
    ],
  );

  const handleOpenLibrary = useCallback<
    StudioGenerateComposerProps['onOpenLibrary']
  >((role = 'reference') => {
    setContentLibraryRole(role);
    setIsContentLibraryOpen(true);
  }, []);

  useEffect(() => {
    if (type !== 'video') {
      return;
    }
    const unsupportedRoles = new Set<StudioGenerateReferenceRole>();
    const supportsInterpolation = hasInterpolation(settings.modelKey);
    const hasStartFrame =
      contentReferences.some((reference) => reference.role === 'startFrame') ||
      attachments.some(
        (attachment) =>
          attachment.file &&
          uploadRolesRef.current.get(attachment.file) === 'startFrame',
      );
    if (!hasEndFrame(settings.modelKey)) {
      unsupportedRoles.add('endFrame');
    } else if (supportsInterpolation && !hasStartFrame) {
      unsupportedRoles.add('endFrame');
    } else if (!supportsInterpolation && hasStartFrame) {
      unsupportedRoles.add('endFrame');
    }
    if (!hasVideoReferences(settings.modelKey)) {
      unsupportedRoles.add('videoReference');
    }
    const removedContentCount = contentReferences.filter((reference) =>
      unsupportedRoles.has(reference.role),
    ).length;
    const unsupportedAttachments = attachments.filter((attachment) => {
      const role = attachment.file
        ? uploadRolesRef.current.get(attachment.file)
        : undefined;
      return role ? unsupportedRoles.has(role) : false;
    });
    if (removedContentCount === 0 && unsupportedAttachments.length === 0) {
      return;
    }
    setContentReferences((current) =>
      current.filter((reference) => !unsupportedRoles.has(reference.role)),
    );
    for (const attachment of unsupportedAttachments) {
      removeAttachment(attachment.id);
    }
    notificationsService.warning(
      !supportsInterpolation &&
        hasStartFrame &&
        unsupportedRoles.has('endFrame')
        ? 'End Frame was cleared because the selected model accepts only one frame.'
        : 'Unsupported frame or video references were cleared for the selected model.',
    );
  }, [
    attachments,
    contentReferences,
    notificationsService,
    removeAttachment,
    settings.modelKey,
    type,
  ]);

  const attachedAssets = useMemo<PromptBarAttachedAsset[]>(
    () => [
      ...attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        previewUrl: attachment.previewUrl,
        role:
          (attachment.file
            ? uploadRolesRef.current.get(attachment.file)
            : undefined) ??
          (type === 'video'
            ? attachment.kind === 'video'
              ? ('videoReference' as const)
              : ('startFrame' as const)
            : ('reference' as const)),
        source: 'upload' as const,
      })),
      ...contentReferences.map((reference) => ({
        id: reference.item.id,
        kind: reference.item.contentType.toLowerCase().includes('video')
          ? ('video' as const)
          : ('image' as const),
        name: reference.item.contentTitle,
        previewUrl: reference.item.thumbnailUrl,
        role: reference.role,
        source: 'library' as const,
      })),
    ],
    [attachments, contentReferences, type],
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
        current.filter((reference) => reference.item.id !== assetId),
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

  // Vary/Reprompt reloads the composer from the card's recipe rather than
  // firing immediately — the operator tweaks the enriched request instead of
  // retyping the raw box.
  const handleVaryRecipe = useCallback(
    (job: StudioGenerateJob) => {
      const recipe = job.recipe
        ? job.recipe
        : job.ingredient
          ? recipeFromRepromptData(
              buildRepromptData(
                job.ingredient,
                getStudioGenerateTypeConfig(job.type).ingredientCategory,
                brandId,
                [...models],
              ),
              job.type,
            )
          : null;

      if (!recipe) {
        setType(job.type);
        setPrompt(job.prompt);
        return;
      }

      applyTypeSettings(job.type, settingsPatchFromRecipe(recipe));
      setPrompt(recipe.text);
    },
    [applyTypeSettings, brandId, models, setType],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SectionTopbar
        actions={
          <div className="flex items-center gap-2">
            <Searchbar
              className="w-64"
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              placeholder="Search generations"
              size={ComponentSize.SM}
              value={search}
            />
            <ViewToggle
              activeView={resultsView}
              onChange={(view) => {
                if (view === ViewType.GRID || view === ViewType.LIST) {
                  setResultsView(view);
                }
              }}
              options={[
                {
                  icon: <Rows3 className="size-4" />,
                  label: translate('viewList'),
                  type: ViewType.LIST,
                },
                {
                  icon: <LayoutGrid className="size-4" />,
                  label: translate('viewGrid'),
                  type: ViewType.GRID,
                },
              ]}
              size={ComponentSize.SM}
            />
          </div>
        }
        subtitle={translate('description')}
        title={translate('title')}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
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
              onReprompt={handleVaryRecipe}
              onSelect={(job) => setSelectedJobId(job.id)}
              selectedJobId={selectedJobId}
              view={resultsView}
            />
          </div>
        </div>
        {selectedJob ? (
          <StudioGenerateInspector
            job={selectedJob}
            onClose={() => setSelectedJobId(null)}
            onSelect={(job) => setSelectedJobId(job.id)}
            onVary={handleVaryRecipe}
            runJobs={selectedRunJobs}
          />
        ) : null}
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
              onAddFiles={handleAddFiles}
              onOpenLibrary={handleOpenLibrary}
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
