'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentApiService } from '@genfeedai/agent';
import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import { useContentMentions } from '@genfeedai/agent/hooks/use-content-mentions';
import { useMicrophoneInput } from '@genfeedai/agent/hooks/use-microphone-input';
import { useStudioCharacterMentions } from '@genfeedai/agent/hooks/use-studio-character-mentions';
import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  IngredientCategory,
  SkillSurface,
  UploadStatus,
  ViewType,
} from '@genfeedai/contracts';
import {
  getImageEditMaxSources,
  getModelMaxVideoReferences,
  hasEndFrame,
  hasInterpolation,
  hasVideoReferences,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type {
  IIngredient,
  IStudioGenerateDraft,
  KnowledgeSelection,
} from '@genfeedai/contracts/interfaces';
import type {
  StudioGenerateDraftPayload,
  StudioGenerateJob,
  StudioGenerateReferenceRole,
  StudioGenerateType,
} from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { normalizeCrunVideoDraft } from '@genfeedai/helpers/crun-video-input.helper';
import type { BrandKnowledgeSelection } from '@genfeedai/props/content/knowledge-library.props';
import type { PromptEditorDocumentSeed } from '@genfeedai/props/prompt-bars/prompt-editor.props';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type {
  StudioGenerateComposerProps,
  StudioGenerateFilter,
  StudioGenerateStarterSelection,
} from '@genfeedai/props/studio/studio-generate.props';
import type { AttachmentItem } from '@genfeedai/props/ui/attachments.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAttachments } from '@hooks/ui/use-attachments/use-attachments';
import { useStoryboardEntry } from '@hooks/ui/use-storyboard-entry/use-storyboard-entry';
import KnowledgeReferenceSection, {
  countKnowledgeSelection,
} from '@pages/library/knowledge/components/KnowledgeReferenceSection';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import StudioGenerateInspector from '@pages/studio/generate/components/StudioGenerateInspector';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import StudioGenerateStarterIdeas from '@pages/studio/generate/components/StudioGenerateStarterIdeas';
import { useCrunGenerationQuote } from '@pages/studio/generate/hooks/useCrunGenerationQuote';
import { useStudioGenerateAssetActions } from '@pages/studio/generate/hooks/useStudioGenerateAssetActions';
import { useStudioGenerateDraft } from '@pages/studio/generate/hooks/useStudioGenerateDraft';
import { useStudioGenerateGallery } from '@pages/studio/generate/hooks/useStudioGenerateGallery';
import { useStudioGenerateHandoff } from '@pages/studio/generate/hooks/useStudioGenerateHandoff';
import { useStudioGenerateModels } from '@pages/studio/generate/hooks/useStudioGenerateModels';
import { useStudioGenerateSettings } from '@pages/studio/generate/hooks/useStudioGenerateSettings';
import { useStudioGeneration } from '@pages/studio/generate/hooks/useStudioGeneration';
import { useStudioPromptEnhancement } from '@pages/studio/generate/hooks/useStudioPromptEnhancement';
import {
  buildRepromptData,
  buildStudioCrunQuoteRequest,
  buildStudioCrunVideoQuoteRequest,
} from '@pages/studio/generate/utils/generation-payloads';
import { prepareCrunGenerationIntent } from '@pages/studio/generate/utils/prepare-crun-generation-intent';
import {
  filterStudioGenerateJobs,
  mergeStudioGenerateJobs,
  resolveStudioAssetUrl,
} from '@pages/studio/generate/utils/studio-generate-asset';
import {
  buildStudioSettingsPatchFromHandoff,
  resolveHandoffIdentityNotice,
  resolveHandoffModelKey,
  resolveHandoffSettingsOverrides,
  studioHandoffReferenceRole,
} from '@pages/studio/generate/utils/studio-generate-handoff';
import {
  groupStudioGenerateJobsByRun,
  readStudioCrunRecipeControls,
  recipeFromIngredient,
  recipeFromRepromptData,
  settingsPatchFromRecipe,
} from '@pages/studio/generate/utils/studio-generate-recipe';
import {
  pickStarterCharacter,
  pickStarterProductReference,
} from '@pages/studio/generate/utils/studio-generate-starter-ideas';
import {
  sanitizeStudioGenerateSettings,
  sanitizeStudioGenerateState,
} from '@pages/studio/generate/utils/studio-generate-storage';
import {
  getStudioGenerateTypeConfig,
  isStudioGenerateType,
  listStudioGenerateTypeConfigs,
} from '@pages/studio/generate/utils/studio-generate-types';
import { getDefaultGenerationSetupValues } from '@pages/studio/generate/utils/studio-generation-setup-bridge';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { NotificationsService } from '@services/core/notifications.service';
import type { JSONContent } from '@tiptap/core';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import {
  buildStudioGenerationSetupScope,
  setGenerationSetupField,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Label } from '@ui/primitives/label';
import Searchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { usePromptCommandExtension } from '@ui/prompt-editor/use-prompt-command-extension';
import { LayoutGrid, RotateCcw, Rows3 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
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

const EMPTY_KNOWLEDGE_SELECTION: KnowledgeSelection = {};
const EMPTY_ATTACHMENTS: AttachmentItem[] = [];

function toContentReference(
  asset: IIngredient,
  role: StudioGenerateReferenceRole,
): StudioContentReference | null {
  const thumbnailUrl = resolveStudioAssetUrl(asset);
  if (!thumbnailUrl) {
    return null;
  }

  return {
    item: {
      brandId: asset.brandId ?? null,
      contentTitle:
        asset.metadataLabel || asset.promptText || 'Generated reference',
      contentType: String(asset.category),
      id: asset.id,
      thumbnailUrl,
    },
    role,
  };
}

/** A composer upload restored from the draft: already a Library asset. */
function toRestoredAttachment(asset: IIngredient): AttachmentItem | null {
  const url = resolveStudioAssetUrl(asset);
  if (!url) {
    return null;
  }

  return {
    id: asset.id,
    ingredientId: asset.id,
    kind: asset.category === IngredientCategory.VIDEO ? 'video' : 'image',
    name: asset.metadataLabel || 'Upload',
    previewUrl: url,
    status: UploadStatus.COMPLETED,
    url,
  };
}

export default function StudioGenerateWorkspace(): ReactElement {
  const editSourceQueryId = useSearchParams().get('editImage');
  const translate = useTranslations('pages.studioGenerate');
  const translateActions = useTranslations('ui.quickActions');
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
  } = usePromptCommandExtension({
    surface: SkillSurface.STUDIO,
    recognizedSkillSlugs,
  });
  const extraExtensions = useMemo(
    () => [...characterMentionExtensions, ...promptCommandExtensions],
    [characterMentionExtensions, promptCommandExtensions],
  );
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
  } = useStudioGenerateSettings();

  const authIdentity = useAuthIdentity();
  const crunRestoreScope = JSON.stringify([
    brandId,
    organizationId,
    authIdentity.userId,
    authIdentity.sessionId,
    EnvironmentService.apiEndpoint,
  ]);
  const crunRestoreScopeRef = useRef(crunRestoreScope);
  const crunRestoreEpochRef = useRef(0);
  if (crunRestoreScopeRef.current !== crunRestoreScope) {
    crunRestoreEpochRef.current += 1;
    crunRestoreScopeRef.current = crunRestoreScope;
  }
  const [crunRestoreStatus, setCrunRestoreStatus] = useState<
    'pending' | 'failed' | null
  >(null);
  const clearCrunRestore = useCallback(() => {
    crunRestoreEpochRef.current += 1;
    setCrunRestoreStatus(null);
  }, []);
  const [prompt, setPrompt] = useState('');
  const [documentSeed, setDocumentSeed] =
    useState<PromptEditorDocumentSeed | null>(null);
  const {
    cancelEnhance,
    enhancePrompt,
    isEnhancing: isEnhancingPrompt,
    enhancedPromptId,
    previousPrompt: previousEnhancedPrompt,
    undoEnhance,
  } = useStudioPromptEnhancement({
    brandId,
    contentType: type === 'image' || type === 'video' ? type : undefined,
    modelKey: settings.modelKey,
    onPromptChange: setPrompt,
    prompt,
    resolveRequestedSkills: resolvePromptCommands,
  });
  const [search, setSearch] = useState('');
  const [resultType, setResultType] = useState<StudioGenerateFilter>('all');
  const [resultSort, setResultSort] = useState<'newest' | 'oldest'>('newest');
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
  const [brandKnowledgeSelection, setBrandKnowledgeSelection] =
    useState<BrandKnowledgeSelection>({
      brandId: undefined,
      value: EMPTY_KNOWLEDGE_SELECTION,
    });
  // A pick made under another brand is never sent: switching brand returns
  // the Library picker to Auto instead of carrying foreign sources over.
  const knowledgeSelection =
    brandKnowledgeSelection.brandId === brandId
      ? brandKnowledgeSelection.value
      : EMPTY_KNOWLEDGE_SELECTION;
  const hasKnowledgeSelection = countKnowledgeSelection(knowledgeSelection) > 0;
  const handleKnowledgeSelectionChange = useCallback(
    (value: KnowledgeSelection) => {
      setBrandKnowledgeSelection({ brandId, value });
    },
    [brandId],
  );
  const uploadRolesRef = useRef(
    new WeakMap<File, StudioGenerateReferenceRole>(),
  );
  // Restored uploads carry no File; their role is keyed by attachment id.
  const restoredRolesRef = useRef(
    new Map<string, StudioGenerateReferenceRole>(),
  );
  const [restoredAttachments, setRestoredAttachments] =
    useState<AttachmentItem[]>(EMPTY_ATTACHMENTS);
  // Restored uploads reach `attachments` one render after the Library
  // references; until they do, frame validation would see half a restore.
  const [pendingRestoredUploadIds, setPendingRestoredUploadIds] = useState<
    string[] | null
  >(null);
  const getAttachmentRole = useCallback(
    (attachment: AttachmentItem): StudioGenerateReferenceRole | undefined =>
      attachment.file
        ? uploadRolesRef.current.get(attachment.file)
        : restoredRolesRef.current.get(attachment.id),
    [],
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

      return await agentApiService.uploadAttachment(file, onProgress);
    },
    [agentApiService],
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
  } = useAttachments({
    acceptedTypes: STUDIO_REFERENCE_TYPES,
    initialAttachments: restoredAttachments,
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
  const { isLoadingModels, models } = useStudioGenerateModels(
    modelCategory,
    organizationId,
  );
  const editSourceLimit = getImageEditMaxSources(
    models.find((model) => model.key === settings.modelKey)?.key ??
      models.find((model) => model.isDefault)?.key,
  );
  const { galleryError, isLoadingGallery, refresh, storedJobs } =
    useStudioGenerateGallery({
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
                  brandId: ingredient.brandId ?? null,
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
  const { cancelJob, isGenerating, jobs, rehydratePending, removeJob, submit } =
    useStudioGeneration({
      brandId,
      models,
      onGenerated: refresh,
      settings,
      type,
    });
  // #4670 Open in Studio: a resolved Agent handoff pre-fills the composer.
  // Precedence over remembered local settings comes for free from
  // `applyTypeSettings` — it marks every patched field `'user'`-owned in the
  // shared setup store, exactly like an operator editing the popover
  // themselves would.
  const { isLoading: isHandoffLoading, payload: handoffPayload } =
    useStudioGenerateHandoff();
  const appliedHandoffRef = useRef(false);
  const handoffScope = useMemo(
    () => ({ brandId, getIngredientsService, handoffPayload, organizationId }),
    [brandId, getIngredientsService, handoffPayload, organizationId],
  );
  const [acceptedHandoffScope, setAcceptedHandoffScope] = useState<
    typeof handoffScope | null
  >(null);
  const isHandoffAccepted = acceptedHandoffScope === handoffScope;
  const handoffScopeRef = useRef(handoffScope);
  const handoffReferencesControllerRef = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    if (handoffScopeRef.current !== handoffScope) {
      handoffReferencesControllerRef.current?.abort();
      handoffScopeRef.current = handoffScope;
    }
  }, [handoffScope]);
  // Guards the reference fetch against resolving after a real unmount while
  // surviving React Strict Mode's dev-only mount -> cleanup -> mount cycle,
  // which re-sets it to `true` before the in-flight request resolves.
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Wait for the active brand to resolve before deciding anything — an
    // empty `brandId` on the first render is a hydration race, never a real
    // mismatch, and must not permanently reject a valid handoff.
    if (
      !isHydrated ||
      !handoffPayload ||
      !brandId ||
      appliedHandoffRef.current
    ) {
      return;
    }
    appliedHandoffRef.current = true;

    // #4716 review P2: the handoff's server-side scope is org/user only —
    // it carries no brand check. A handoff created under a different brand
    // must never silently prefill this brand's composer with another
    // brand's prompt, settings, or references.
    if (handoffPayload.brandId !== brandId) {
      notificationsService.info(
        'That Studio handoff has expired or was already used. Continuing with your usual defaults.',
      );
      return;
    }
    setAcceptedHandoffScope(handoffScope);

    const handoffSlugs = handoffPayload.requestedSkillSlugs ?? [];
    setRecognizedSkillSlugs((previous) => [
      ...new Set([...previous, ...handoffSlugs]),
    ]);
    setPrompt(
      [...handoffSlugs.map((slug) => `/${slug}`), handoffPayload.prompt].join(
        ' ',
      ),
    );
    applyTypeSettings(
      handoffPayload.type,
      buildStudioSettingsPatchFromHandoff(handoffPayload),
    );

    const identityNotice = resolveHandoffIdentityNotice(handoffPayload);
    if (identityNotice) {
      notificationsService.info(identityNotice);
    }
  }, [
    applyTypeSettings,
    brandId,
    handoffPayload,
    handoffScope,
    isHydrated,
    notificationsService,
  ]);

  // Keep the one-request latch across Strict Mode's synthetic remount.
  // Scope changes permanently invalidate the pending result, without retrying
  // a handoff that has already been consumed.
  const handoffReferencesRequestedRef = useRef(false);
  useEffect(() => {
    if (
      !isHandoffAccepted ||
      !handoffPayload ||
      handoffReferencesRequestedRef.current
    ) {
      return;
    }
    const referenceIds = handoffPayload.references ?? [];
    if (referenceIds.length === 0) {
      return;
    }
    handoffReferencesRequestedRef.current = true;

    const role = studioHandoffReferenceRole(handoffPayload.type);
    const controller = new AbortController();
    handoffReferencesControllerRef.current = controller;
    const isScopeCurrent = () =>
      isMountedRef.current &&
      !controller.signal.aborted &&
      handoffScopeRef.current === handoffScope;
    void (async () => {
      try {
        const service = await getIngredientsService();
        if (!isScopeCurrent()) {
          return;
        }
        const assets = await service.findByIds(referenceIds);
        const newReferences = assets.flatMap(
          (asset) => toContentReference(asset, role) ?? [],
        );
        if (!isScopeCurrent() || newReferences.length === 0) {
          return;
        }
        setContentReferences((current) => [...current, ...newReferences]);
      } catch {
        // Best-effort: references the Agent resolved moments ago may already
        // be gone by the time Studio opens. Skip them rather than blocking
        // the rest of the prefill.
      }
    })();
  }, [getIngredientsService, handoffPayload, handoffScope, isHandoffAccepted]);

  // #4716 review P1: the Agent resolves a concrete model at handoff time, but
  // the org's enabled-model allowlist can differ from what the Agent saw (or
  // change before Studio opens). Validate once the catalog for the handoff's
  // own type has finished loading and fall back to Studio's own Auto default
  // with a notice, rather than repeating `resolveModelKey`'s silent
  // `models[0]` substitution one step earlier and just as silently.
  const handoffModelValidatedRef = useRef(false);
  useEffect(() => {
    if (
      !handoffPayload ||
      !isHandoffAccepted ||
      handoffModelValidatedRef.current ||
      type !== handoffPayload.type ||
      isLoadingModels
    ) {
      return;
    }
    handoffModelValidatedRef.current = true;

    if (!getStudioGenerateTypeConfig(type).capabilities.hasModelSelection) {
      return;
    }

    const { isFallback, modelKey } = resolveHandoffModelKey(
      handoffPayload.modelKey,
      models,
    );
    if (isFallback) {
      updateSettings({ modelKey });
    }

    // #4716 review FR9: validate the handoff's other params (aspectRatio,
    // duration, outputs, resolution) against what the *resolved* model
    // supports — using the just-corrected model when the pick itself fell
    // back, so resolution options are checked against the model settings
    // will actually carry, not a since-rejected one.
    const { droppedFields, patch } = resolveHandoffSettingsOverrides(
      handoffPayload,
      modelKey,
      models,
    );
    if (Object.keys(patch).length > 0) {
      updateSettings(patch);
    }

    const notices: string[] = [];
    if (isFallback) {
      notices.push(
        "The Agent's model pick for this generation isn't available for your organization — using Studio's default instead.",
      );
    }
    if (droppedFields.length > 0) {
      notices.push(
        `Some settings from the Agent (${droppedFields.join(', ')}) aren't supported here — Studio's defaults were used instead.`,
      );
    }
    if (notices.length > 0) {
      notificationsService.info(notices.join(' '));
    }
  }, [
    handoffPayload,
    isHandoffAccepted,
    isLoadingModels,
    models,
    notificationsService,
    type,
    updateSettings,
  ]);

  const assetActions = useStudioGenerateAssetActions({
    onAttachReference: handleAttachGeneratedReference,
    onDeleted: removeJob,
    onRefresh: refresh,
  });

  useEffect(() => {
    rehydratePending(storedJobs);
  }, [rehydratePending, storedJobs]);

  const galleryJobs = useMemo(
    () => mergeStudioGenerateJobs(jobs, storedJobs),
    [jobs, storedJobs],
  );
  const visibleJobs = useMemo(() => {
    const filtered = filterStudioGenerateJobs(galleryJobs, {
      search,
      type: resultType,
    });
    return resultSort === 'oldest' ? [...filtered].reverse() : filtered;
  }, [galleryJobs, resultSort, resultType, search]);
  const showStarterIdeas =
    !galleryError &&
    !isLoadingGallery &&
    galleryJobs.length === 0 &&
    prompt.trim().length === 0;
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
        const explicitRole = attachment
          ? getAttachmentRole(attachment)
          : undefined;
        const role: StudioGenerateReferenceRole =
          explicitRole ??
          (type === 'video'
            ? completed.kind === 'video'
              ? 'videoReference'
              : 'startFrame'
            : type === 'image-edit'
              ? 'editSource'
              : 'reference');
        return { id: completed.ingredientId, role };
      }),
      ...contentReferences.map((reference) => ({
        id: reference.item.id,
        role: reference.role,
      })),
    ];

    return {
      editSourceIds: entries
        .filter((entry) => entry.role === 'editSource')
        .toSorted(
          (left, right) =>
            Number(right.id === settings.editPrimaryId) -
            Number(left.id === settings.editPrimaryId),
        )
        .map((entry) => entry.id),
      editMaskId: entries.find((entry) => entry.role === 'editMask')?.id,
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
  }, [
    attachments,
    contentReferences,
    getAttachmentRole,
    getCompletedAttachments,
    type,
    settings.editPrimaryId,
  ]);

  useEffect(() => {
    if (type !== 'image-edit' || !resolvedReferences.editSourceIds.length)
      return;
    if (
      !settings.editPrimaryId ||
      !resolvedReferences.editSourceIds.includes(settings.editPrimaryId)
    )
      updateSettings({ editPrimaryId: resolvedReferences.editSourceIds[0] });
  }, [
    type,
    resolvedReferences.editSourceIds,
    settings.editPrimaryId,
    updateSettings,
  ]);

  const rejectUnsupportedSkillSelection = useCallback(
    (skillSlugs: string[]) => {
      if (skillSlugs.length && type !== 'image' && type !== 'video') {
        notificationsService.warning(
          'Selected skills are supported for image and video generation. Remove the skill selections to continue here.',
        );
        return true;
      }
      return false;
    },
    [notificationsService.warning, type],
  );

  const handleEnhancePrompt = useCallback(() => {
    const { skillSlugs } = resolvePromptCommands(prompt);
    if (type === 'image-edit' || rejectUnsupportedSkillSelection(skillSlugs))
      return;
    return enhancePrompt();
  }, [
    enhancePrompt,
    prompt,
    type,
    rejectUnsupportedSkillSelection,
    resolvePromptCommands,
  ]);

  const handleStarterIdea = useCallback(
    (selection: StudioGenerateStarterSelection) => {
      // The editor reports getText() after the seed lands. Setting the prompt
      // here would sync a plain string over the character chip.
      const scope = buildStudioGenerationSetupScope(selection.type);
      const defaults = getDefaultGenerationSetupValues(selection.type);
      if (selection.promptTemplate) {
        setGenerationSetupField(
          scope,
          'promptTemplate',
          selection.promptTemplate,
          defaults,
        );
      }
      if (selection.aspectRatio) {
        setGenerationSetupField(
          scope,
          'aspectRatio',
          selection.aspectRatio,
          defaults,
        );
      }
      if (selection.instrumental !== undefined) {
        setGenerationSetupField(
          scope,
          'instrumental',
          selection.instrumental,
          defaults,
        );
      }
      setType(selection.type);
      setDocumentSeed({
        content: selection.content,
        id: selection.seedId,
      });
      if (selection.productReference) {
        const attached = selection.productReference;
        setContentReferences((current) => {
          const next: StudioContentReference = {
            item: {
              brandId: brandId || null,
              contentTitle: attached.label,
              contentType: 'reference',
              id: attached.id,
              thumbnailUrl: attached.previewUrl,
            },
            role: attached.role,
          };
          return [
            ...current.filter((reference) => reference.item.id !== attached.id),
            next,
          ];
        });
      }
      if (selection.openLibraryRole) {
        setContentLibraryRole(selection.openLibraryRole);
        setIsContentLibraryOpen(true);
      }
    },
    [brandId, setType],
  );

  const crunModel =
    type === 'image' || type === 'video'
      ? models.find(
          (model) =>
            model.key === settings.modelKey && model.provider === 'crun',
        )
      : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: editor document revisions and character catalog changes alter resolver output even when the displayed prompt is unchanged.
  const crunPreparedIntent = useMemo(
    () =>
      crunModel
        ? prepareCrunGenerationIntent({
            document: promptDocumentRef.current,
            existingReferenceIds: resolvedReferences.imageReferenceIds,
            prompt,
            resolvePromptCommands,
            resolveCharacterMentions,
          })
        : {
            text: prompt,
            referenceIds: resolvedReferences.imageReferenceIds,
            notices: [],
            skillSlugs: [],
          },
    [
      crunModel,
      prompt,
      resolvedReferences.imageReferenceIds,
      resolvePromptCommands,
      resolveCharacterMentions,
      quoteDocumentRevision,
      characterMentions,
    ],
  );
  const crunRequest = useMemo(
    () =>
      buildStudioCrunQuoteRequest({
        model: type === 'image' ? crunModel : undefined,
        settings,
        promptText: crunPreparedIntent.text,
        references: crunPreparedIntent.referenceIds,
        brandId,
        ...(enhancedPromptId && crunPreparedIntent.text === prompt
          ? { promptId: enhancedPromptId }
          : {
              requestedSkillSlugs: crunPreparedIntent.skillSlugs,
              ...(hasKnowledgeSelection
                ? { knowledge: knowledgeSelection }
                : {}),
            }),
        harness: false,
      }),
    [
      crunModel,
      type,
      settings,
      crunPreparedIntent,
      brandId,
      enhancedPromptId,
      prompt,
      hasKnowledgeSelection,
      knowledgeSelection,
    ],
  );
  const crunVideoRequest = useMemo(() => {
    if (type !== 'video' || resolvedReferences.videoReferenceIds.length)
      return null;
    return buildStudioCrunVideoQuoteRequest({
      model: crunModel,
      settings,
      promptText: crunPreparedIntent.text,
      references: crunPreparedIntent.referenceIds,
      endFrameId: resolvedReferences.endFrameId,
      brandId,
      ...(enhancedPromptId && crunPreparedIntent.text === prompt
        ? { promptId: enhancedPromptId }
        : {
            requestedSkillSlugs: crunPreparedIntent.skillSlugs,
            ...(hasKnowledgeSelection ? { knowledge: knowledgeSelection } : {}),
          }),
      harness: false,
    });
  }, [
    type,
    crunModel,
    settings,
    crunPreparedIntent,
    resolvedReferences.endFrameId,
    resolvedReferences.videoReferenceIds,
    brandId,
    enhancedPromptId,
    prompt,
    hasKnowledgeSelection,
    knowledgeSelection,
  ]);
  const crunQuote = useCrunGenerationQuote(
    type === 'video'
      ? {
          mediaKind: 'video',
          request:
            isEnhancingPrompt || isUploading || crunRestoreStatus
              ? null
              : crunVideoRequest,
          isActive: Boolean(crunModel),
        }
      : {
          request:
            isEnhancingPrompt || isUploading || crunRestoreStatus
              ? null
              : crunRequest,
          isActive: Boolean(crunModel),
        },
  );

  const handleSubmit = useCallback(() => {
    if (crunRestoreStatus || isUploading || isListening || isTranscribing) {
      return;
    }
    if (type === 'image-edit') {
      void submit(prompt, resolvedReferences).then((accepted) => {
        if (accepted) setPrompt('');
      });
      return;
    }
    // Skills picked from `/` are literal tokens in the prompt. They steer the
    // enhancement pass, never the generator, so they come off first.
    const prepared = prepareCrunGenerationIntent({
      document: promptDocumentRef.current,
      existingReferenceIds: resolvedReferences.imageReferenceIds,
      prompt,
      resolvePromptCommands,
      resolveCharacterMentions,
    });
    const { skillSlugs } = prepared;
    if (rejectUnsupportedSkillSelection(skillSlugs)) return;
    for (const notice of prepared.notices) {
      notificationsService.warning(notice);
    }
    void submit(
      prepared.text,
      {
        ...resolvedReferences,
        imageReferenceIds: prepared.referenceIds,
      },
      crunModel
        ? {
            ...(crunRequest ? { crunRequest } : {}),
            ...(crunVideoRequest ? { crunVideoRequest } : {}),
            getCurrentCrunQuote: crunQuote.getCurrentQuote,
          }
        : skillSlugs.length ||
            hasKnowledgeSelection ||
            (isHandoffAccepted && handoffPayload?.harness !== undefined) ||
            (enhancedPromptId && prepared.text === prompt)
          ? {
              ...(skillSlugs.length ? { requestedSkillSlugs: skillSlugs } : {}),
              ...(hasKnowledgeSelection
                ? { knowledge: knowledgeSelection }
                : {}),
              ...(isHandoffAccepted && handoffPayload?.harness !== undefined
                ? { harness: handoffPayload.harness }
                : {}),
              ...(enhancedPromptId && prepared.text === prompt
                ? { promptId: enhancedPromptId }
                : {}),
            }
          : undefined,
    ).then((isAccepted) => {
      // A sent generation leaves an empty composer (and draft) behind; the
      // model settings stay for the next one.
      if (isAccepted) {
        setPrompt('');
        setContentReferences([]);
        restoredRolesRef.current.clear();
        setPendingRestoredUploadIds(null);
        setRestoredAttachments(EMPTY_ATTACHMENTS);
        clearAttachments();
      }
    });
  }, [
    clearAttachments,
    type,
    isHandoffAccepted,
    handoffPayload,
    crunModel,
    crunRequest,
    crunVideoRequest,
    crunQuote.getCurrentQuote,
    enhancedPromptId,
    hasKnowledgeSelection,
    knowledgeSelection,
    isListening,
    isTranscribing,
    isUploading,
    crunRestoreStatus,
    notificationsService,
    prompt,
    resolvedReferences,
    resolveCharacterMentions,
    rejectUnsupportedSkillSelection,
    resolvePromptCommands,
    submit,
  ]);

  const handleSelectContentReference = useCallback(
    (item: ContentMentionItem) => {
      clearCrunRestore();
      if (!item.thumbnailUrl) {
        return;
      }
      if (contentLibraryRole === 'editSource') {
        const count =
          contentReferences.filter(
            (reference) => reference.role === 'editSource',
          ).length +
          attachments.filter(
            (attachment) => getAttachmentRole(attachment) === 'editSource',
          ).length;
        if (
          count >= editSourceLimit &&
          !contentReferences.some((reference) => reference.item.id === item.id)
        ) {
          notificationsService.warning(
            `Image editing accepts at most ${editSourceLimit} source images.`,
          );
          return;
        }
      }
      if (contentLibraryRole === 'editMask') {
        for (const attachment of attachments)
          if (getAttachmentRole(attachment) === 'editMask')
            removeAttachment(attachment.id);
        setContentReferences((current) => [
          ...current.filter(
            (reference) =>
              reference.role !== 'editMask' && reference.item.id !== item.id,
          ),
          { item, role: 'editMask' },
        ]);
        setIsContentLibraryOpen(false);
        return;
      }
      const videoControls = models.find(
        (model) => model.key === settings.modelKey && model.provider === 'crun',
      )?.inputControls;
      const supportsInterpolation =
        videoControls?.mediaKind === 'video'
          ? videoControls.videoRules?.referenceMode === 'start-end'
          : hasInterpolation(settings.modelKey);
      const hasStartFrame =
        contentReferences.some(
          (reference) => reference.role === 'startFrame',
        ) ||
        attachments.some(
          (attachment: AttachmentItem) =>
            getAttachmentRole(attachment) === 'startFrame',
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
            (attachment: AttachmentItem) =>
              getAttachmentRole(attachment) === 'videoReference',
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
      clearCrunRestore,
      models,
      contentReferences,
      getAttachmentRole,
      notificationsService,
      editSourceLimit,
      settings.modelKey,
      settings.resolution,
      updateSettings,
      removeAttachment,
    ],
  );

  const handleAddFiles = useCallback<StudioGenerateComposerProps['onAddFiles']>(
    (files: File[], role: StudioGenerateReferenceRole = 'reference') => {
      clearCrunRestore();
      const videoControls = models.find(
        (model) => model.key === settings.modelKey && model.provider === 'crun',
      )?.inputControls;
      const supportsInterpolation =
        videoControls?.mediaKind === 'video'
          ? videoControls.videoRules?.referenceMode === 'start-end'
          : hasInterpolation(settings.modelKey);
      const hasStartFrame =
        contentReferences.some(
          (reference) => reference.role === 'startFrame',
        ) ||
        attachments.some(
          (attachment: AttachmentItem) =>
            getAttachmentRole(attachment) === 'startFrame',
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
          const attachmentRole = getAttachmentRole(attachment);
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
      if (role === 'editSource') {
        const count =
          contentReferences.filter(
            (reference) => reference.role === 'editSource',
          ).length +
          attachments.filter(
            (attachment) => getAttachmentRole(attachment) === 'editSource',
          ).length;
        acceptedFiles = files
          .filter((file) => file.type.startsWith('image/'))
          .slice(0, Math.max(0, editSourceLimit - count));
        if (acceptedFiles.length < files.length)
          notificationsService.warning(
            `Image editing accepts at most ${editSourceLimit} source images.`,
          );
      }
      if (role === 'editMask') {
        acceptedFiles = files
          .filter((file) => file.type.startsWith('image/'))
          .slice(0, 1);
        setContentReferences((current) =>
          current.filter((reference) => reference.role !== 'editMask'),
        );
        for (const attachment of attachments)
          if (getAttachmentRole(attachment) === 'editMask')
            removeAttachment(attachment.id);
      }
      if (role === 'videoReference') {
        const selectedVideoReferences =
          contentReferences.filter(
            (reference) => reference.role === 'videoReference',
          ).length +
          attachments.filter(
            (attachment: AttachmentItem) =>
              getAttachmentRole(attachment) === 'videoReference',
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
      clearCrunRestore,
      models,
      attachments,
      contentReferences,
      getAttachmentRole,
      notificationsService,
      removeAttachment,
      editSourceLimit,
      settings.modelKey,
      settings.resolution,
      updateSettings,
    ],
  );

  const handleOpenLibrary = useCallback<
    StudioGenerateComposerProps['onOpenLibrary']
  >((role: StudioGenerateReferenceRole = 'reference') => {
    setContentLibraryRole(role);
    setIsContentLibraryOpen(true);
  }, []);

  useEffect(() => {
    if (
      pendingRestoredUploadIds?.every((id) =>
        attachments.some((attachment: AttachmentItem) => attachment.id === id),
      )
    ) {
      setPendingRestoredUploadIds(null);
    }
  }, [attachments, pendingRestoredUploadIds]);

  useEffect(() => {
    if (type !== 'video' || pendingRestoredUploadIds) {
      return;
    }
    const selectedCrunModel = models.find(
      (model) => model.key === settings.modelKey && model.provider === 'crun',
    );
    const videoControls = selectedCrunModel?.inputControls;
    if (
      settings.modelKey?.startsWith('crun/') &&
      (isLoadingModels ||
        !selectedCrunModel ||
        videoControls?.mediaKind !== 'video')
    ) {
      return;
    }
    const unsupportedRoles = new Set<StudioGenerateReferenceRole>();
    const supportsInterpolation =
      videoControls?.mediaKind === 'video'
        ? videoControls.videoRules?.referenceMode === 'start-end'
        : hasInterpolation(settings.modelKey);
    const hasStartFrame =
      contentReferences.some((reference) => reference.role === 'startFrame') ||
      attachments.some(
        (attachment: AttachmentItem) =>
          getAttachmentRole(attachment) === 'startFrame',
      );
    if (
      !(videoControls?.mediaKind === 'video'
        ? videoControls.videoRules?.referenceMode === 'start-end'
        : hasEndFrame(settings.modelKey))
    ) {
      unsupportedRoles.add('endFrame');
    } else if (supportsInterpolation && !hasStartFrame) {
      unsupportedRoles.add('endFrame');
    } else if (!supportsInterpolation && hasStartFrame) {
      unsupportedRoles.add('endFrame');
    }
    if (
      videoControls?.mediaKind === 'video' ||
      !hasVideoReferences(settings.modelKey)
    ) {
      unsupportedRoles.add('videoReference');
    }
    if (
      videoControls?.mediaKind === 'video' &&
      videoControls.videoRules?.referenceMode === 'none'
    )
      unsupportedRoles.add('startFrame');
    const removedContentCount = contentReferences.filter((reference) =>
      unsupportedRoles.has(reference.role),
    ).length;
    const unsupportedAttachments = attachments.filter(
      (attachment: AttachmentItem) => {
        const role = getAttachmentRole(attachment);
        return role ? unsupportedRoles.has(role) : false;
      },
    );
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
    getAttachmentRole,
    notificationsService,
    pendingRestoredUploadIds,
    removeAttachment,
    settings.modelKey,
    models,
    isLoadingModels,
    type,
  ]);

  const resolveAttachmentRole = useCallback(
    (attachment: AttachmentItem): StudioGenerateReferenceRole =>
      getAttachmentRole(attachment) ??
      (type === 'video'
        ? attachment.kind === 'video'
          ? 'videoReference'
          : 'startFrame'
        : type === 'image-edit'
          ? 'editSource'
          : 'reference'),
    [getAttachmentRole, type],
  );

  const attachedAssets = useMemo<PromptBarAttachedAsset[]>(
    () =>
      [
        ...attachments.map((attachment: AttachmentItem) => ({
          id: attachment.id,
          ingredientId: attachment.ingredientId,
          isPrimary: attachment.ingredientId === settings.editPrimaryId,
          kind: attachment.kind,
          name: attachment.name,
          previewUrl: attachment.previewUrl,
          role: resolveAttachmentRole(attachment),
          source: 'upload' as const,
        })),
        ...contentReferences.map((reference) => ({
          id: reference.item.id,
          ingredientId: reference.item.id,
          isPrimary: reference.item.id === settings.editPrimaryId,
          kind: reference.item.contentType.toLowerCase().includes('video')
            ? ('video' as const)
            : ('image' as const),
          name: reference.item.contentTitle,
          previewUrl: reference.item.thumbnailUrl,
          role: reference.role,
          source: 'library' as const,
        })),
      ].toSorted(
        (left, right) => Number(right.isPrimary) - Number(left.isPrimary),
      ),
    [
      attachments,
      contentReferences,
      resolveAttachmentRole,
      settings.editPrimaryId,
    ],
  );

  const handleRemoveAttachedAsset = useCallback<
    StudioGenerateComposerProps['onRemoveAttachedAsset']
  >(
    (assetId) => {
      clearCrunRestore();
      if (
        attachments.some(
          (attachment: AttachmentItem) => attachment.id === assetId,
        )
      ) {
        removeAttachment(assetId);
        return;
      }
      setContentReferences((current) =>
        current.filter((reference) => reference.item.id !== assetId),
      );
    },
    [attachments, removeAttachment, clearCrunRestore],
  );

  const draftSettingsByType = useMemo(() => {
    const copy = { ...settingsByType };
    for (const key of Object.keys(copy) as StudioGenerateType[]) {
      copy[key] = {
        ...copy[key],
        crunControls: sanitizeStudioGenerateSettings(key, copy[key])
          .crunControls,
      };
    }
    return copy;
  }, [settingsByType]);

  const draftPayload = useMemo<StudioGenerateDraftPayload>(
    () => ({
      attachments: attachments.flatMap((attachment: AttachmentItem) =>
        attachment.status === UploadStatus.COMPLETED && attachment.ingredientId
          ? [
              {
                id: attachment.ingredientId,
                role: resolveAttachmentRole(attachment),
              },
            ]
          : [],
      ),
      knowledgeSelection,
      prompt,
      references: contentReferences.map((reference) => ({
        id: reference.item.id,
        role: reference.role,
      })),
      settingsByType: draftSettingsByType,
      type,
    }),
    [
      attachments,
      contentReferences,
      knowledgeSelection,
      prompt,
      resolveAttachmentRole,
      draftSettingsByType,
      type,
    ],
  );

  // Everything that can fail (the asset lookup) runs first; the composer
  // is only touched once the whole restoration is known and still wanted,
  // so a failed lookup leaves it untouched for the load retry.
  const restoreDraft = useCallback(
    async (
      draft: IStudioGenerateDraft,
      signal: AbortSignal,
      canApply: () => boolean,
    ) => {
      const referenceIds = [...draft.references, ...draft.attachments].map(
        (reference) => reference.id,
      );
      let assetsById = new Map<string, IIngredient>();
      if (referenceIds.length > 0) {
        const service = await getIngredientsService();
        const assets = await service.findByIds(referenceIds);
        assetsById = new Map(assets.map((asset) => [asset.id, asset]));
      }
      if (signal.aborted || !canApply()) {
        return 0;
      }

      const references = draft.references.flatMap((reference) => {
        const asset = assetsById.get(reference.id);
        return (asset && toContentReference(asset, reference.role)) ?? [];
      });
      const restoredRoles = new Map<string, StudioGenerateReferenceRole>();
      const restoredUploads = draft.attachments.flatMap((reference) => {
        const asset = assetsById.get(reference.id);
        const attachment = asset ? toRestoredAttachment(asset) : null;
        if (!attachment) {
          return [];
        }
        restoredRoles.set(attachment.id, reference.role);
        return [attachment];
      });

      restoreSettings(
        sanitizeStudioGenerateState({
          settingsByType: draft.settingsByType,
          type: draft.type,
        }),
      );
      setPrompt(draft.prompt);
      setBrandKnowledgeSelection({
        brandId,
        value: draft.knowledgeSelection,
      });
      restoredRolesRef.current = restoredRoles;
      setPendingRestoredUploadIds(
        restoredUploads.length > 0
          ? restoredUploads.map((attachment) => attachment.id)
          : null,
      );
      setContentReferences(references);
      setRestoredAttachments(restoredUploads);
      return referenceIds.length - references.length - restoredUploads.length;
    },
    [brandId, getIngredientsService, restoreSettings],
  );

  const { saveStatus: draftSaveStatus } = useStudioGenerateDraft({
    brandId,
    canRestore: isHydrated && !isHandoffLoading,
    isAutosaveEnabled: true,
    isRestoreBlocked:
      Boolean(handoffPayload) ||
      (typeof window !== 'undefined' && Boolean(editSourceQueryId)),
    onRestore: restoreDraft,
    payload: draftPayload,
  });

  const handleEditJob = useCallback(
    (job: StudioGenerateJob) => {
      if (!job.ingredient) return;
      const reference = toContentReference(job.ingredient, 'editSource');
      if (!reference) return;
      clearCrunRestore();
      clearAttachments();
      setRestoredAttachments(EMPTY_ATTACHMENTS);
      restoredRolesRef.current.clear();
      setContentReferences([reference]);
      setPrompt('');
      applyTypeSettings('image-edit', {
        editSize: 'source',
        editSeed: undefined,
        editPrimaryId: reference.item.id,
      });
    },
    [clearAttachments, clearCrunRestore, applyTypeSettings],
  );

  const editEntryRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHydrated || !brandId) return;
    const sourceId = editSourceQueryId;
    if (!sourceId || editEntryRef.current === `${brandId}:${sourceId}`) return;
    editEntryRef.current = `${brandId}:${sourceId}`;
    clearCrunRestore();
    const epoch = crunRestoreEpochRef.current;
    const scope = crunRestoreScopeRef.current;
    let cancelled = false;
    const isCurrent = () =>
      !cancelled &&
      isMountedRef.current &&
      epoch === crunRestoreEpochRef.current &&
      scope === crunRestoreScopeRef.current;
    void getIngredientsService()
      .then(async (service) => {
        if (!isCurrent()) return;
        const ingredient = await service.findOne(sourceId, { brandId });
        if (!isCurrent()) return;
        if (
          !ingredient ||
          ingredient.brandId !== brandId ||
          ingredient.category !== IngredientCategory.IMAGE
        )
          throw new Error('Editing source not found in this brand.');
        const reference = toContentReference(ingredient, 'editSource');
        if (!reference) throw new Error('Editing source has no preview.');
        clearAttachments();
        setRestoredAttachments(EMPTY_ATTACHMENTS);
        restoredRolesRef.current.clear();
        setContentReferences([reference]);
        setType('image-edit');
        setPrompt('');
        applyTypeSettings('image-edit', {
          editSize: 'source',
          editSeed: undefined,
          editPrimaryId: reference.item.id,
        });
      })
      .catch((error: unknown) => {
        if (isCurrent())
          notificationsService.error(
            error instanceof Error
              ? error.message
              : 'Editing source unavailable.',
          );
      });
    return () => {
      cancelled = true;
      editEntryRef.current = null;
    };
  }, [
    isHydrated,
    brandId,
    editSourceQueryId,
    getIngredientsService,
    clearAttachments,
    clearCrunRestore,
    setType,
    applyTypeSettings,
    notificationsService,
  ]);

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
      const recipe =
        job.type === 'image-edit' && job.ingredient
          ? recipeFromIngredient(job.ingredient, job.type)
          : job.recipe
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

      clearCrunRestore();
      if (!recipe) {
        setType(job.type);
        setPrompt(job.prompt);
        return;
      }

      if (
        recipe.type === 'video' &&
        recipe.modelKey?.startsWith('crun/') &&
        recipe.crunControls
      ) {
        const epoch = crunRestoreEpochRef.current;
        const scope = crunRestoreScopeRef.current;
        const model = models.find(
          (item) => item.key === recipe.modelKey && item.provider === 'crun',
        );
        const controls = model?.inputControls;
        const residual = readStudioCrunRecipeControls(
          recipe.crunControls,
          'video',
          recipe.modelKey,
        );
        if (controls?.mediaKind !== 'video' || !residual || !brandId) {
          setCrunRestoreStatus('failed');
          notificationsService.warning(translate('crun.videoQuoteStale'));
          return;
        }
        const valid = normalizeCrunVideoDraft(controls, {
          modelKey: residual.modelKey,
          contractVersion: residual.contractVersion,
          prompt: recipe.text,
          duration: recipe.duration,
          resolution: recipe.resolution,
          aspectRatio: recipe.aspectRatio,
          negativePrompt: residual.negativePrompt,
          guidanceScale: residual.guidanceScale,
          translatePrompt: residual.translatePrompt,
          startFrameId: recipe.references[0],
          endFrameId: recipe.endFrameId,
        }).isValid;
        if (!valid) {
          setCrunRestoreStatus('failed');
          notificationsService.warning(translate('crun.videoQuoteStale'));
          return;
        }
        setCrunRestoreStatus('pending');
        const isCurrent = () =>
          isMountedRef.current &&
          crunRestoreEpochRef.current === epoch &&
          crunRestoreScopeRef.current === scope;
        void (async () => {
          try {
            const ids = [
              ...recipe.references,
              ...(recipe.endFrameId ? [recipe.endFrameId] : []),
            ];
            const service = ids.length ? await getIngredientsService() : null;
            if (!isCurrent()) return;
            const assets = service ? await service.findByIds(ids) : [];
            if (!isCurrent()) return;
            const restored: StudioContentReference[] = [];
            for (const id of ids) {
              const asset = assets.find((item) => item.id === id);
              const reference =
                asset &&
                asset.category === IngredientCategory.IMAGE &&
                !asset.isDeleted &&
                asset.brandId === brandId
                  ? toContentReference(
                      asset,
                      id === recipe.endFrameId ? 'endFrame' : 'startFrame',
                    )
                  : null;
              if (!reference) throw new Error('Unavailable frame');
              restored.push(reference);
            }
            clearAttachments();
            setContentReferences(restored);
            applyTypeSettings('video', {
              ...settingsPatchFromRecipe(recipe),
              aspectRatio:
                recipe.aspectRatio ??
                (typeof controls.fields.aspect_ratio?.default === 'string'
                  ? controls.fields.aspect_ratio.default
                  : ''),
              resolution: recipe.resolution ?? '',
            });
            setPrompt(recipe.text);
            promptDocumentRef.current = null;
            setDocumentSeed(null);
            setCrunRestoreStatus(null);
          } catch {
            if (isCurrent()) {
              setCrunRestoreStatus('failed');
              notificationsService.warning(
                translate('crun.referenceUnavailable'),
              );
            }
          }
        })();
        return;
      }
      if (recipe.type === 'video' && recipe.modelKey?.startsWith('crun/')) {
        clearAttachments();
        setContentReferences([]);
      }
      if (recipe.imageEdit) {
        const edit = recipe.imageEdit;
        const epoch = crunRestoreEpochRef.current;
        const scope = crunRestoreScopeRef.current;
        const isCurrent = () =>
          isMountedRef.current &&
          epoch === crunRestoreEpochRef.current &&
          scope === crunRestoreScopeRef.current;
        clearAttachments();
        setRestoredAttachments(EMPTY_ATTACHMENTS);
        restoredRolesRef.current.clear();
        setContentReferences([]);
        const ids = [...edit.sourceIds, ...(edit.maskId ? [edit.maskId] : [])];
        void getIngredientsService()
          .then(async (service) => {
            if (!isCurrent()) return;
            const ingredients = await service.findByIds(ids);
            if (!isCurrent()) return;
            const byId = new Map(
              ingredients.map((ingredient) => [ingredient.id, ingredient]),
            );
            const references = ids.flatMap((id) => {
              const ingredient = byId.get(id);
              const reference =
                ingredient && ingredient.brandId === brandId
                  ? toContentReference(
                      ingredient,
                      id === edit.maskId ? 'editMask' : 'editSource',
                    )
                  : null;
              return reference ? [reference] : [];
            });
            setContentReferences(
              references.length === ids.length ? references : [],
            );
            if (references.length !== ids.length)
              notificationsService.warning(
                'Some editing sources are unavailable. Choose replacement sources before submitting.',
              );
          })
          .catch(() => {
            if (isCurrent())
              notificationsService.error(
                'Editing sources could not be restored.',
              );
          });
      }
      applyTypeSettings(job.type, settingsPatchFromRecipe(recipe));
      setPrompt(recipe.text);
    },
    [
      applyTypeSettings,
      brandId,
      models,
      setType,
      clearCrunRestore,
      clearAttachments,
      getIngredientsService,
      notificationsService,
      translate,
    ],
  );

  const handleSelectJob = useCallback((job: StudioGenerateJob) => {
    setSelectedJobId(job.id);
  }, []);
  const handleCloseInspector = useCallback(() => {
    setSelectedJobId(null);
  }, []);
  // Remix feeds a finished image back into the composer as an image
  // reference. Videos are not offered: a video reference is dropped again by
  // any model without video-reference support, including Auto.
  const handleRemixJob = useCallback(
    (job: StudioGenerateJob) => {
      if (job.ingredient && job.type === 'image') {
        handleAttachGeneratedReference(job.ingredient, 'image');
      }
    },
    [handleAttachGeneratedReference],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SectionTopbar
        actions={
          <div className="flex items-center gap-2">
            <Select
              onValueChange={(value) => {
                if (value === 'all' || isStudioGenerateType(value)) {
                  setResultType(value);
                }
              }}
              value={resultType}
            >
              <SelectTrigger
                aria-label={translate('filters.type')}
                className="w-36"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {translate('filters.allTypes')}
                </SelectItem>
                {listStudioGenerateTypeConfigs().map((config) => (
                  <SelectItem key={config.type} value={config.type}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                if (value === 'newest' || value === 'oldest') {
                  setResultSort(value);
                }
              }}
              value={resultSort}
            >
              <SelectTrigger
                aria-label={translate('filters.sort')}
                className="w-40"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">
                  {translate('filters.newest')}
                </SelectItem>
                <SelectItem value="oldest">
                  {translate('filters.oldest')}
                </SelectItem>
              </SelectContent>
            </Select>
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
            <ButtonRefresh isRefreshing={isLoadingGallery} onClick={refresh} />
          </div>
        }
        leading={
          <Searchbar
            ariaLabel={translate('searchPlaceholder')}
            isCollapsible
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            placeholder={translate('searchPlaceholder')}
            size={ComponentSize.SM}
            value={search}
          />
        }
        subtitle={translate('description')}
        title={translate('title')}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="relative z-0 h-full overflow-auto px-6 py-6 pb-40">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
              {galleryError ? (
                <Alert role="alert">
                  <AlertTitle>
                    {translate(`history.${galleryError}FailedTitle`)}
                  </AlertTitle>
                  <AlertDescription>
                    <p>
                      {translate(`history.${galleryError}FailedDescription`)}
                    </p>
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
              {showStarterIdeas ? (
                <StudioGenerateStarterIdeas
                  character={pickStarterCharacter(characterMentions)}
                  isDisabled={isGenerating}
                  onSelect={handleStarterIdea}
                  productReference={pickStarterProductReference(
                    selectedBrand?.references,
                  )}
                />
              ) : !galleryError || visibleJobs.length > 0 ? (
                <StudioGenerateResults
                  assetActions={{
                    ...assetActions,
                    onCancelGeneration: cancelJob,
                  }}
                  isLoading={isLoadingGallery}
                  jobs={visibleJobs}
                  onReprompt={handleVaryRecipe}
                  onSelect={handleSelectJob}
                  selectedJobId={selectedJobId}
                  view={resultsView}
                />
              ) : null}
            </div>
          </div>
          <PromptBarContainer
            className="px-5 pb-5"
            layoutMode="surface-fixed"
            maxWidth="4xl"
            zIndex={40}
          >
            <div {...(capabilities.hasReferences ? dragHandlers : {})}>
              {draftSaveStatus === 'idle' ? null : (
                <p
                  aria-live="polite"
                  className={`mb-1 text-right text-2xs ${
                    draftSaveStatus === 'error' || draftSaveStatus === 'failed'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }`}
                  data-draft-status={draftSaveStatus}
                  data-testid="studio-draft-status"
                  role="status"
                >
                  {draftSaveStatus === 'saving'
                    ? translate('draft.saving')
                    : draftSaveStatus === 'error'
                      ? translate('draft.saveFailed')
                      : draftSaveStatus === 'failed'
                        ? translate('draft.saveRejected')
                        : translate('draft.saved')}
                </p>
              )}
              {attachments
                .filter(
                  (attachment: AttachmentItem) =>
                    attachment.kind === 'video' &&
                    attachment.status === UploadStatus.COMPLETED &&
                    attachment.ingredientId,
                )
                .map((attachment: AttachmentItem) => (
                  <Button
                    ariaLabel={`${translateActions('remixThisVideo')}: ${attachment.name}`}
                    className="mb-2 mr-2"
                    key={attachment.id}
                    label={translateActions('remixThisVideo')}
                    onClick={() => {
                      if (attachment.ingredientId)
                        void storyboardEntry.createFromUploadAssetId(
                          attachment.ingredientId,
                        );
                    }}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                    withWrapper={false}
                  />
                ))}
              {crunRestoreStatus === 'failed' ? (
                <Label role="alert">
                  {translate('crun.referenceUnavailable')}
                </Label>
              ) : null}
              <StudioGenerateComposer
                attachedAssets={attachedAssets}
                crunQuote={crunModel ? crunQuote : undefined}
                isCrunRestoreBlocked={Boolean(crunRestoreStatus)}
                crunReferenceCount={crunPreparedIntent.referenceIds.length}
                crunStartFrameId={crunPreparedIntent.referenceIds[0]}
                crunEndFrameId={resolvedReferences.endFrameId}
                documentSeed={documentSeed}
                extraExtensions={extraExtensions}
                isDragActive={capabilities.hasReferences && dragState.isActive}
                isEnhancingPrompt={isEnhancingPrompt}
                isGenerating={isGenerating}
                isListening={isListening}
                isLoadingModels={isLoadingModels}
                isTranscribing={isTranscribing}
                isUploading={isUploading}
                models={models}
                onAddFiles={handleAddFiles}
                onCancelEnhancePrompt={cancelEnhance}
                onEnhancePrompt={handleEnhancePrompt}
                onOpenLibrary={handleOpenLibrary}
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
                onStartListening={startListening}
                onStopListening={stopListening}
                onSubmit={handleSubmit}
                onTypeChange={(value) => {
                  clearCrunRestore();
                  setType(value);
                }}
                onUndoEnhancePrompt={undoEnhance}
                prompt={prompt}
                previousPrompt={previousEnhancedPrompt}
                settings={settings}
                shouldShowVoiceInput={shouldShowVoiceInput}
                type={type}
              />
            </div>
          </PromptBarContainer>
        </div>
      </div>

      <ContextSidebarPanel
        onClose={handleCloseInspector}
        selection={
          selectedJob
            ? {
                id: selectedJob.id,
                kind: 'asset',
                // Only a card click or a run-sibling pick selects a job.
                origin: 'user',
                subtitle:
                  selectedJob.modelKey || translate('inspector.autoModel'),
                title: getStudioGenerateTypeConfig(selectedJob.type).label,
              }
            : null
        }
      >
        {selectedJob ? (
          <StudioGenerateInspector
            job={selectedJob}
            onRemix={handleRemixJob}
            onEdit={handleEditJob}
            onSelect={handleSelectJob}
            onUseInPost={assetActions.onPublishIngredient}
            onVary={handleVaryRecipe}
            runJobs={selectedRunJobs}
          />
        ) : null}
      </ContextSidebarPanel>

      <ContentLibraryPicker
        isLoading={isContentLibraryLoading}
        isOpen={isContentLibraryOpen}
        items={contentLibraryItems}
        knowledgeSection={
          type !== 'image-edit' ? (
            <KnowledgeReferenceSection
              brandId={brandId || undefined}
              key={brandId || 'no-brand'}
              onChange={handleKnowledgeSelectionChange}
              value={knowledgeSelection}
            />
          ) : null
        }
        onOpenChange={setIsContentLibraryOpen}
        onSelect={handleSelectContentReference}
        selectedIds={selectedContentIds}
      />
    </div>
  );
}
