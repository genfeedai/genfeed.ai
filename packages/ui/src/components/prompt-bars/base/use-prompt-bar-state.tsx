'use client';

import {
  useGalleryModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection.context';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
  type QualityTier,
  type SubscriptionTier,
} from '@genfeedai/contracts';
import {
  getModelDefaultDuration,
  getModelDurations,
} from '@genfeedai/contracts/constants';
import { createCrunVideoDraft } from '@genfeedai/helpers/crun-video-input.helper';
import {
  getDefaultVideoResolution,
  hasResolutionOptions,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSpeechRecording } from '@genfeedai/hooks/media/use-speech-recording/use-speech-recording';
import {
  resolveStudioGenerationCostModels,
  resolveStudioGenerationMeter,
} from '@genfeedai/hooks/prompt-bar/resolve-studio-generation-meter/resolve-studio-generation-meter';
import {
  serializeCrunQuoteIntent,
  useCrunGenerationQuote,
} from '@genfeedai/hooks/prompt-bar/use-crun-generation-quote/use-crun-generation-quote';
import { usePromptBarEnhancement } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-enhancement/use-prompt-bar-enhancement';
import { usePromptBarFilters } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-filters/use-prompt-bar-filters';
import { usePromptBarForm } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-form/use-prompt-bar-form';
import { usePromptBarModels } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-models/use-prompt-bar-models';
import { usePromptBarPricing } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-pricing/use-prompt-bar-pricing';
import { usePromptBarReferences } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-references/use-prompt-bar-references';
import { usePromptBarSync } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-sync/use-prompt-bar-sync';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type {
  PromptBarAttachedAsset,
  PromptBarProps,
} from '@genfeedai/props/studio/prompt-bar.props';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import type { JSONContent } from '@tiptap/core';
import {
  getConfigForCategoryType,
  getConfigForRoute,
} from '@ui-constants/media.constant';
import { RectangleHorizontal, RectangleVertical, Square } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';

import {
  EMPTY_ARRAY,
  PROMPT_BAR_TEXTAREA_MAX_HEIGHT,
  resizeTextarea,
  toAttachedPromptAsset,
} from './prompt-bar.helpers';
import { usePromptBarDragDrop } from './use-prompt-bar-drag-drop';
import { usePromptBarInternalContextValue } from './use-prompt-bar-internal-context-value';

type UsePromptBarStateParams = Pick<
  PromptBarProps,
  | 'models'
  | 'trainings'
  | 'presets'
  | 'folders'
  | 'profiles'
  | 'moods'
  | 'styles'
  | 'cameras'
  | 'scenes'
  | 'fontFamilies'
  | 'blacklists'
  | 'sounds'
  | 'lightings'
  | 'lenses'
  | 'cameraMovements'
  | 'avatars'
  | 'voices'
  | 'categoryType'
  | 'onDatasetChange'
  | 'onSubmit'
  | 'onCancel'
  | 'isGenerating'
  | 'isGenerateDisabled'
  | 'requiresModelSelection'
  | 'generateLabel'
  | 'externalFormat'
  | 'externalWidth'
  | 'externalHeight'
  | 'promptData'
  | 'promptText'
  | 'onTextChange'
  | 'promptConfig'
  | 'onConfigChange'
  | 'features'
  | 'suggestions'
  | 'onSuggestionSelect'
  | 'showSuggestionsWhenEmpty'
  | 'maxSuggestions'
  | 'isDisabled'
  | 'extraExtensions'
  | 'onPromptDocumentChange'
  | 'onPrepareSubmit'
  | 'crunBinding'
  | 'crunVideoBinding'
>;

export function usePromptBarState({
  crunBinding,
  crunVideoBinding,
  isDisabled = false,
  models = EMPTY_ARRAY,
  trainings = EMPTY_ARRAY,
  presets = EMPTY_ARRAY,
  folders = EMPTY_ARRAY,
  profiles = EMPTY_ARRAY,
  moods = EMPTY_ARRAY,
  styles = EMPTY_ARRAY,
  cameras = EMPTY_ARRAY,
  scenes = EMPTY_ARRAY,
  fontFamilies = EMPTY_ARRAY,
  blacklists = EMPTY_ARRAY,
  sounds = EMPTY_ARRAY,
  lightings = EMPTY_ARRAY,
  lenses = EMPTY_ARRAY,
  cameraMovements = EMPTY_ARRAY,
  avatars = EMPTY_ARRAY,
  voices = EMPTY_ARRAY,
  categoryType,
  onDatasetChange = () => {},
  onSubmit,
  onCancel,
  isGenerating = false,
  isGenerateDisabled = false,
  requiresModelSelection = true,
  generateLabel = 'Generate',
  externalFormat,
  externalWidth,
  externalHeight,
  promptData,
  promptText,
  onTextChange,
  promptConfig,
  onConfigChange,
  features = {},
  suggestions,
  onSuggestionSelect,
  showSuggestionsWhenEmpty = true,
  maxSuggestions = 3,
  extraExtensions,
  onPromptDocumentChange,
  onPrepareSubmit,
}: UsePromptBarStateParams) {
  const useSplitState = promptText !== undefined && promptConfig !== undefined;
  const isCollapsible = features.collapsible ?? true;
  const hasDragDrop = features.dragDrop ?? true;
  const pathname = usePathname();

  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { openGallery } = useGalleryModal();
  const { openUpload } = useUploadModal();
  const { brandId, organizationId, selectedBrand, settings } = useBrand();
  const { activeGenerations } = useAssetSelection();
  const { currentUser } = useCurrentUser();
  const { subscribe } = useSocketManager();
  const getPromptsService = useAuthedService((token: string) =>
    PromptsService.getInstance(token),
  );

  const [selectedPreset, setSelectedPreset] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(isCollapsible);
  const isAdvancedMode = currentUser?.settings?.isAdvancedMode ?? true;
  const [isAutoMode, setIsAutoMode] = useState(!isAdvancedMode);
  const isAdvancedControlsEnabled = !isAutoMode;

  const currentConfig = useMemo(() => {
    if (categoryType) {
      return getConfigForCategoryType(categoryType);
    }
    return getConfigForRoute(pathname);
  }, [categoryType, pathname]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const collapsedInputRef = useRef<HTMLInputElement | null>(null);
  const modelDropdownRef = useRef<HTMLButtonElement | null>(null);
  const promptBarRef = useRef<HTMLDivElement>(null);
  const isInternalUpdateRef = useRef(false);
  const hasExpandedRef = useRef(false);
  const [promptBarHeight, setPromptBarHeight] = useState(0);

  const resizePromptTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      resizeTextarea(textarea, PROMPT_BAR_TEXTAREA_MAX_HEIGHT);
    },
    [],
  );

  useEffect(() => {
    if (!promptBarRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPromptBarHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(promptBarRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const { form, currentFormat } = usePromptBarForm({ promptData });

  const watchedModelsValue = useWatch({
    control: form.control,
    name: 'models',
  });
  const watchedAutoSelectModel = useWatch({
    control: form.control,
    name: 'autoSelectModel',
  });
  useEffect(() => {
    setIsAutoMode(watchedAutoSelectModel === true);
  }, [watchedAutoSelectModel]);
  const watchedModels = useMemo(
    () => watchedModelsValue || [],
    [watchedModelsValue],
  );
  const normalizedWatchedModels = useMemo(
    () =>
      (watchedModels as string[]).filter((modelKey): modelKey is string =>
        Boolean(modelKey),
      ),
    [watchedModels],
  );
  const watchedModel = (normalizedWatchedModels[0] ||
    currentConfig.defaultModel) as string;
  const watchedFormat = useWatch({
    control: form.control,
    name: 'format',
  }) as IngredientFormat;
  const watchedSpeech = useWatch({ control: form.control, name: 'speech' });
  const watchedWidth = useWatch({ control: form.control, name: 'width' });
  const watchedHeight = useWatch({ control: form.control, name: 'height' });
  const watchedDuration = useWatch({ control: form.control, name: 'duration' });
  const watchedOutputs = useWatch({ control: form.control, name: 'outputs' });
  const watchedQuality = useWatch({
    control: form.control,
    name: 'quality',
  }) as QualityTier | undefined;
  const translateCrun = useTranslations('pages.studioGenerate.crun');
  useWatch({ control: form.control });
  const crunConsumedRef = useRef<string | null>(null);
  const crunSubmittingRef = useRef(false);
  const [, setCrunDocumentRevision] = useState(0);
  const subscriptionTier = settings?.subscriptionTier as
    | SubscriptionTier
    | undefined;

  const {
    trainingIds,
    selectedModels,
    getUnionFromAllModels,
    getMinFromAllModels,
    supportsMultipleReferences,
    requiresReferences,
    maxReferenceCount,
    isOnlyImagenModels,
    hasAnyImagenModel,
    hasSpeech,
    hasEndFrame,
    supportsInterpolation,
    hasAudioToggle,
    hasModelWithoutDurationEditing,
    hasAnyResolutionOptions,
  } = usePromptBarModels({
    models,
    normalizedWatchedModels,
    trainings,
    watchedModel,
  });

  const crunModel =
    selectedModels.length === 1 && selectedModels[0]?.provider === 'crun'
      ? selectedModels[0]
      : undefined;
  const crunInputControls = crunModel?.inputControls;
  const watchedCrunControls = useWatch({
    control: form.control,
    name: 'crunControls',
  });

  const currentModelCategory = useMemo(() => {
    switch (categoryType) {
      case IngredientCategory.VIDEO:
        return ModelCategory.VIDEO;
      case IngredientCategory.IMAGE:
        return ModelCategory.IMAGE;
      case IngredientCategory.MUSIC:
        return ModelCategory.MUSIC;
      default: {
        if (normalizedWatchedModels.length === 0) {
          return null;
        }
        const firstModel = models.find(
          (m) => m.key === normalizedWatchedModels[0],
        );
        return firstModel?.category || ModelCategory.VIDEO;
      }
    }
  }, [categoryType, models, normalizedWatchedModels]);

  const pricedModels = useMemo(
    () =>
      resolveStudioGenerationCostModels({
        catalog: models,
        defaultModelKey: currentConfig.defaultModel,
        selectedModels,
      }),
    [currentConfig.defaultModel, models, selectedModels],
  );

  const { selectedModelCost: staticSelectedModelCost } = usePromptBarPricing({
    selectedModels: pricedModels.models,
    watchedDuration,
    watchedHeight,
    watchedOutputs,
    watchedWidth,
  });

  const hasCrunSelection = selectedModels.some(
    (model) => model.provider === 'crun',
  );
  const {
    filteredStyles,
    filteredMoods,
    filteredCameras,
    filteredScenes,
    filteredLightings,
    filteredLenses,
    filteredCameraMovements,
    filteredFontFamilies,
    filteredPresets,
    filteredBlacklists,
    filteredSounds,
  } = usePromptBarFilters({
    blacklists,
    cameraMovements,
    cameras,
    currentModelCategory,
    fontFamilies,
    lenses,
    lightings,
    moods,
    normalizedWatchedModels,
    presets,
    scenes,
    sounds,
    styles,
  });

  const {
    references,
    setReferences,
    endFrame,
    setEndFrame,
    referenceSource,
    setReferenceSource,
    handleReferenceSelect,
    handleSelectAccountReference,
    isUserSelectingReferencesRef,
    hasInitializedReferencesRef,
  } = usePromptBarReferences({
    currentFormat,
    currentModelCategory,
    form,
    maxReferenceCount,
    notificationsService,
    selectedBrand,
    supportsMultipleReferences,
  });

  const attachedPromptAssets = useMemo<PromptBarAttachedAsset[]>(() => {
    const source = referenceSource === 'brand' ? 'library' : 'upload';
    const nextAttachedAssets = references.map((reference) =>
      toAttachedPromptAsset(
        reference,
        currentModelCategory === ModelCategory.VIDEO
          ? 'startFrame'
          : 'reference',
        source,
      ),
    );

    if (endFrame) {
      nextAttachedAssets.push(
        toAttachedPromptAsset(endFrame, 'endFrame', source),
      );
    }

    return nextAttachedAssets;
  }, [currentModelCategory, endFrame, referenceSource, references]);

  const {
    handleTextChange,
    handleTextareaChange,
    triggerConfigChange,
    flushConfigChange,
    setTextValue,
  } = usePromptBarSync({
    categoryType,
    externalFormat,
    externalHeight,
    externalWidth,
    form,
    hasInitializedReferencesRef,
    isUserSelectingReferencesRef,
    models,
    onConfigChange,
    onDatasetChange,
    onTextChange,
    promptConfig,
    promptData,
    promptText,
    referenceSource,
    references,
    setReferenceSource,
    setReferences,
    useSplitState,
  });

  const { isEnhancing, previousPrompt, enhancePrompt, handleUndo, handleCopy } =
    usePromptBarEnhancement({
      brandId,
      clipboardService,
      form,
      getPromptsService,
      notificationsService,
      organizationId,
      resizeTextarea: resizePromptTextarea,
      selectedProfile,
      setTextValue,
      subscribe,
      textareaRef,
      watchedModel,
    });

  const isCrunVideo = crunInputControls?.mediaKind === 'video';
  const crunRequest =
    crunModel && !isEnhancing
      ? isCrunVideo
        ? (crunVideoBinding?.prepareRequest(form.getValues()) ?? null)
        : (crunBinding?.prepareRequest(form.getValues()) ?? null)
      : null;
  const crunQuote = useCrunGenerationQuote(
    isCrunVideo
      ? {
          mediaKind: 'video',
          request:
            crunModel && !isEnhancing
              ? (crunVideoBinding?.prepareRequest(form.getValues()) ?? null)
              : null,
          isActive: Boolean(crunModel && crunVideoBinding),
        }
      : {
          request:
            crunModel && !isEnhancing
              ? (crunBinding?.prepareRequest(form.getValues()) ?? null)
              : null,
          isActive: Boolean(crunModel && crunBinding),
        },
  );
  const selectedModelCost = hasCrunSelection
    ? (crunQuote.getCurrentQuote()?.credits ?? null)
    : staticSelectedModelCost;
  const crunQuoteLabel = hasCrunSelection
    ? crunQuote.quote?.isAvailable
      ? crunQuote.quote.billingMode === 'byok'
        ? translateCrun('byok')
        : translateCrun('credits', { credits: crunQuote.quote.credits })
      : crunQuote.status === 'pending'
        ? translateCrun('quoteLoading')
        : crunQuote.reasonCode
          ? translateCrun(
              `${isCrunVideo ? 'videoReasons' : 'reasons'}.${crunQuote.reasonCode}`,
            )
          : translateCrun(
              isCrunVideo ? 'videoQuoteUnavailable' : 'quoteUnavailable',
            )
    : null;

  const generationMeter = useMemo(
    () =>
      selectedModelCost === null
        ? null
        : resolveStudioGenerationMeter({
            credits: selectedModelCost,
            isEstimate: pricedModels.isEstimate,
            queuedCount: activeGenerations.length,
          }),
    [activeGenerations.length, pricedModels.isEstimate, selectedModelCost],
  );

  const {
    isRecording,
    isProcessing,
    isSupported,
    error: speechError,
    toggle: toggleVoice,
  } = useSpeechRecording({
    onError: (error: unknown) => {
      notificationsService.error(`Voice transcription failed: ${error}`);
    },
    onTranscription: (result) => {
      const currentText = form.getValues('text');
      const newText = currentText
        ? `${currentText} ${result.text}`
        : result.text;
      form.setValue('text', newText, { shouldValidate: true });

      if (textareaRef.current) {
        textareaRef.current.value = newText;
        const length = newText.length;
        textareaRef.current.setSelectionRange(length, length);
        resizePromptTextarea(textareaRef.current);
      }

      setTextValue(newText.trim());
      notificationsService.success(
        `Voice input transcribed (${result.creditsUsed} credit${result.creditsUsed !== 1 ? 's' : ''} used)`,
      );
    },
  });

  useEffect(() => {
    if (!crunInputControls || !crunModel) {
      if (form.getValues('crunControls')) {
        form.setValue('crunControls', undefined);
        triggerConfigChange();
      }
      return;
    }
    const current = form.getValues('crunControls');
    const identityChanged =
      current?.modelKey !== crunModel.key ||
      current?.contractVersion !== crunInputControls.version;
    if (crunInputControls.mediaKind === 'video') {
      const draft = createCrunVideoDraft(
        crunInputControls,
        form.getValues('text'),
      );
      if (!draft) return;
      if (identityChanged) {
        form.setValue('crunControls', {
          modelKey: draft.modelKey,
          contractVersion: draft.contractVersion,
          aspectRatio: draft.aspectRatio,
          guidanceScale: draft.guidanceScale,
          translatePrompt: draft.translatePrompt,
        });
        form.setValue('duration', draft.duration);
        form.setValue('resolution', draft.resolution ?? '');
        form.setValue('endFrame', '');
        form.setValue('videoReferences', []);
        setEndFrame(null);
        if (crunInputControls.videoRules?.referenceMode === 'none') {
          form.setValue('references', []);
          setReferences([]);
        }
        triggerConfigChange();
      }
      return;
    }
    const formatField = crunInputControls.fields.output_format;
    const outputFormat = formatField?.enum?.includes(
      current?.outputFormat ?? '',
    )
      ? current?.outputFormat
      : typeof formatField?.default === 'string'
        ? formatField.default
        : undefined;
    let changed = false;
    if (identityChanged || current?.outputFormat !== outputFormat) {
      form.setValue('crunControls', {
        modelKey: crunModel.key,
        contractVersion: crunInputControls.version,
        ...(outputFormat ? { outputFormat } : {}),
        ...(current?.aspectRatio &&
        crunInputControls.fields.aspect_ratio?.enum?.includes(
          current.aspectRatio,
        ) &&
        (current.aspectRatio !== 'auto' ||
          references.length > 0 ||
          !crunInputControls.isAutoAspectReferenceRequired)
          ? { aspectRatio: current.aspectRatio }
          : {}),
      });
      changed = true;
    }
    const resolution = crunInputControls.fields.resolution;
    if (!resolution?.enum?.includes(form.getValues('resolution') ?? '')) {
      form.setValue('resolution', String(resolution?.default ?? ''));
      changed = true;
    }
    const aspect = crunInputControls.fields.aspect_ratio;
    const ratio = current?.aspectRatio;
    if (
      !ratio ||
      !aspect?.enum?.includes(ratio) ||
      (ratio === 'auto' &&
        references.length === 0 &&
        crunInputControls.isAutoAspectReferenceRequired)
    ) {
      const envelope = form.getValues('crunControls');
      if (envelope) {
        form.setValue('crunControls', {
          ...envelope,
          aspectRatio: String(aspect?.default ?? '1:1'),
        });
        changed = true;
      }
    }
    const outputs = form.getValues('outputs') ?? 1;
    if (
      !Number.isInteger(outputs) ||
      outputs < 1 ||
      outputs > crunInputControls.maxOutputs
    ) {
      form.setValue(
        'outputs',
        Math.min(
          crunInputControls.maxOutputs,
          Math.max(1, Math.floor(outputs) || 1),
        ),
      );
      changed = true;
    }
    if (changed) triggerConfigChange();
  }, [
    crunInputControls,
    crunModel,
    form,
    references.length,
    triggerConfigChange,
    setEndFrame,
    setReferences,
  ]);

  useEffect(() => {
    if (speechError) {
      notificationsService.error(`Voice input error: ${speechError}`);
    }
  }, [speechError, notificationsService]);

  useEffect(() => {
    if (
      !isCrunVideo &&
      normalizedWatchedModels.length > 0 &&
      !watchedDuration
    ) {
      const defaultDuration = getModelDefaultDuration(watchedModel);
      if (defaultDuration) {
        form.setValue('duration', defaultDuration, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [
    isCrunVideo,
    normalizedWatchedModels.length,
    watchedModel,
    watchedDuration,
    form,
    triggerConfigChange,
  ]);

  useEffect(() => {
    if (!isCrunVideo && watchedModel && hasResolutionOptions(watchedModel)) {
      const currentResolution = form.getValues('resolution');
      if (!currentResolution) {
        const defaultResolution = getDefaultVideoResolution(watchedModel);
        if (defaultResolution) {
          form.setValue('resolution', defaultResolution, {
            shouldValidate: true,
          });
          triggerConfigChange();
        }
      }
    }
  }, [isCrunVideo, watchedModel, form, triggerConfigChange]);

  useEffect(() => {
    if (brandId) {
      form.setValue('brand', brandId, { shouldValidate: true });
    }
  }, [brandId, form]);

  // Simple mode has no model selector: the backend auto-selects the model
  // from prompt + quality, so the form must opt into auto-select or generate
  // would stay blocked on the (hidden) model requirement.
  const hasSelectedModels = normalizedWatchedModels.length > 0;
  useEffect(() => {
    if (isAdvancedMode || hasSelectedModels) {
      return;
    }
    if (form.getValues('autoSelectModel') !== true) {
      form.setValue('autoSelectModel', true, { shouldValidate: true });
      triggerConfigChange();
    }
  }, [isAdvancedMode, hasSelectedModels, form, triggerConfigChange]);

  useEffect(() => {
    if (!isCollapsible || hasExpandedRef.current) {
      return;
    }
    const isDataReady = models.length > 0 && currentConfig.defaultModel;
    if (isDataReady && isCollapsed) {
      const timeoutId = setTimeout(() => {
        setIsCollapsed(false);
        hasExpandedRef.current = true;
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [currentConfig.defaultModel, isCollapsed, isCollapsible, models.length]);

  useEffect(() => {
    if (filteredBlacklists?.length > 0) {
      const currentBlacklists = form.getValues('blacklist') || [];
      const defaultKeys = filteredBlacklists.reduce<string[]>((acc, b) => {
        if (b.isDefault) acc.push(b.key);
        return acc;
      }, []);
      if (defaultKeys.length > 0 && currentBlacklists.length === 0) {
        form.setValue('blacklist', defaultKeys, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [filteredBlacklists, form, triggerConfigChange]);

  useEffect(() => {
    if (filteredSounds?.length > 0) {
      const currentSounds = form.getValues('sounds') || [];
      const defaultKeys = filteredSounds.reduce<string[]>((acc, s) => {
        if (s.isDefault && s.key !== undefined) acc.push(s.key);
        return acc;
      }, []);

      if (defaultKeys.length > 0 && currentSounds.length === 0) {
        form.setValue('sounds', defaultKeys, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [filteredSounds, form, triggerConfigChange]);

  const isModelNotSet =
    requiresModelSelection &&
    watchedAutoSelectModel !== true &&
    normalizedWatchedModels.length === 0;
  const isDisabledState = isDisabled;
  const isGenerateBlocked =
    isDisabled ||
    isModelNotSet ||
    (hasCrunSelection &&
      (!crunModel ||
        !(isCrunVideo ? crunVideoBinding : crunBinding) ||
        !crunRequest ||
        !crunQuote.getCurrentQuote() ||
        crunConsumedRef.current === crunQuote.getCurrentQuote()?.quoteId));

  useEffect(() => {
    if (isModelNotSet && !isCollapsed) {
      const timeoutId = setTimeout(() => {
        modelDropdownRef.current?.focus();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [isModelNotSet, isCollapsed]);

  const refocusTextarea = useCallback(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, []);

  const openAttachedAssetsBrowser = useCallback(() => {
    if (
      !currentConfig.buttons?.reference ||
      isOnlyImagenModels ||
      (isCrunVideo && crunInputControls?.videoRules?.referenceMode === 'none')
    ) {
      return;
    }

    openGallery({
      category: IngredientCategory.IMAGE,
      format: watchedFormat,
      maxSelectableItems: supportsMultipleReferences ? maxReferenceCount : 1,
      onSelect: (selection) => {
        handleReferenceSelect(selection);
      },
      onSelectAccountReference: handleSelectAccountReference,
      selectedReferences: references.reduce<string[]>((acc, reference) => {
        if (reference.id) acc.push(reference.id);
        return acc;
      }, []),
      title:
        currentModelCategory === ModelCategory.VIDEO
          ? 'Select Start Frame'
          : 'Select Reference Images',
    });
  }, [
    currentConfig.buttons,
    currentModelCategory,
    crunInputControls,
    isCrunVideo,
    handleReferenceSelect,
    handleSelectAccountReference,
    isOnlyImagenModels,
    maxReferenceCount,
    openGallery,
    references,
    supportsMultipleReferences,
    watchedFormat,
  ]);

  const promptDocumentRef = useRef<JSONContent | null>(null);

  const handlePromptDocumentChange = useCallback(
    (document: JSONContent) => {
      promptDocumentRef.current = document;
      onPromptDocumentChange?.(document);
      setCrunDocumentRevision((value) => value + 1);
    },
    [onPromptDocumentChange],
  );

  const handleSubmitForm = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (hasCrunSelection) {
        if (
          isGenerateBlocked ||
          isGenerateDisabled ||
          isGenerating ||
          crunSubmittingRef.current ||
          !(isCrunVideo ? crunVideoBinding : crunBinding)
        )
          return;
        const request = isCrunVideo
          ? crunVideoBinding?.prepareRequest(form.getValues())
          : crunBinding?.prepareRequest(form.getValues());
        const quote = crunQuote.getCurrentQuote();
        if (
          !request ||
          !quote ||
          serializeCrunQuoteIntent(request) !==
            serializeCrunQuoteIntent(crunRequest) ||
          crunConsumedRef.current === quote.quoteId
        )
          return;
        crunSubmittingRef.current = true;
        crunConsumedRef.current = quote.quoteId;
        const submission = isCrunVideo
          ? (() => {
              const video = crunVideoBinding?.prepareRequest(form.getValues());
              return (
                video &&
                crunVideoBinding?.submit({
                  ...video,
                  crunQuoteId: quote.quoteId,
                })
              );
            })()
          : (() => {
              const image = crunBinding?.prepareRequest(form.getValues());
              return (
                image &&
                crunBinding?.submit({ ...image, crunQuoteId: quote.quoteId })
              );
            })();
        if (!submission) {
          crunSubmittingRef.current = false;
          return;
        }
        void submission
          .catch(() =>
            notificationsService.error(
              translateCrun(isCrunVideo ? 'videoQuoteStale' : 'quoteStale'),
            ),
          )
          .finally(() => {
            crunSubmittingRef.current = false;
          });
        return;
      }
      if (
        onSubmit &&
        !isGenerateBlocked &&
        !isGenerateDisabled &&
        !isGenerating
      ) {
        if (onPrepareSubmit) {
          const currentReferences = form.getValues('references') ?? [];
          const prepared = onPrepareSubmit({
            document: promptDocumentRef.current,
            references: Array.isArray(currentReferences)
              ? currentReferences
              : [],
            text: form.getValues('text') ?? '',
          });
          form.setValue('text', prepared.text, { shouldValidate: true });
          form.setValue('references', prepared.references, {
            shouldValidate: true,
          });
          for (const notice of prepared.notices ?? []) {
            notificationsService.warning(notice);
          }
        }
        flushConfigChange();
        onSubmit();
      }
    },
    [
      crunBinding,
      crunVideoBinding,
      isCrunVideo,
      crunQuote.getCurrentQuote,
      crunRequest,
      hasCrunSelection,
      translateCrun,
      form,
      isGenerateBlocked,
      isGenerateDisabled,
      isGenerating,
      notificationsService,
      onPrepareSubmit,
      onSubmit,
      flushConfigChange,
    ],
  );

  const videoDurations = useMemo(() => {
    if (isCrunVideo) return [];
    if (normalizedWatchedModels.length === 0) {
      return [...getModelDurations(watchedModel as string)];
    }
    return getUnionFromAllModels<number>(((modelKey) => {
      const durations = getModelDurations(modelKey);
      return Array.from(durations);
    }) as (modelKey: string) => number[]);
  }, [
    isCrunVideo,
    normalizedWatchedModels,
    watchedModel,
    getUnionFromAllModels,
  ]);

  const formatIcon = useMemo(() => {
    switch (watchedFormat) {
      case IngredientFormat.LANDSCAPE:
        return <RectangleHorizontal className="size-4" />;
      case IngredientFormat.SQUARE:
        return <Square className="size-4" />;
      default:
        return <RectangleVertical className="size-4" />;
    }
  }, [watchedFormat]);

  const controlClass =
    'h-9 px-2.5 gap-1.5 flex-shrink-0 !border-transparent !bg-transparent !shadow-none text-muted-foreground hover:!bg-hover hover:!text-foreground';
  const iconButtonClass =
    'size-9 p-0 flex items-center justify-center !border-transparent !bg-transparent !shadow-none text-muted-foreground hover:!bg-hover hover:!text-foreground';
  const textareaRegister = form.register('text');

  const {
    isDragActive,
    dragError,
    handleRemoveAttachedAsset,
    handlePromptBarDragEnter,
    handlePromptBarDragLeave,
    handleDroppedFiles,
  } = usePromptBarDragDrop({
    currentConfig,
    endFrame,
    form,
    handleReferenceSelect,
    isDisabledState,
    isOnlyImagenModels,
    maxReferenceCount,
    openUpload,
    referenceSource,
    references,
    setEndFrame,
    setReferenceSource,
    setReferences,
    supportsMultipleReferences,
    triggerConfigChange,
    watchedHeight,
    watchedWidth,
  });

  const internalContextValue = usePromptBarInternalContextValue({
    activeGenerations,
    attachedPromptAssets,
    avatars,
    controlClass,
    currentConfig,
    currentModelCategory,
    categoryType,
    dragError,
    endFrame,
    enhancePrompt,
    filteredCameraMovements,
    filteredCameras,
    filteredFontFamilies,
    filteredLenses,
    filteredLightings,
    filteredMoods,
    filteredPresets,
    filteredScenes,
    filteredStyles,
    folders,
    form,
    formatIcon,
    generateLabel,
    getMinFromAllModels,
    handleCopy,
    handleDroppedFiles,
    handlePromptBarDragEnter,
    handlePromptBarDragLeave,
    handleRemoveAttachedAsset,
    handleSubmitForm,
    handleTextChange,
    handleTextareaChange,
    handleUndo,
    hasAnyImagenModel,
    hasAnyResolutionOptions,
    hasAudioToggle,
    hasEndFrame,
    hasModelWithoutDurationEditing,
    hasSpeech,
    hasDragDrop,
    iconButtonClass,
    isAdvancedControlsEnabled,
    isAdvancedMode,
    extraExtensions,
    isAutoMode,
    isCollapsed,
    isCollapsible,
    isDragActive,
    isDisabledState,
    isEnhancing,
    isGenerateBlocked,
    isGenerateDisabled,
    isGenerating,
    isModelNotSet,
    isOnlyImagenModels,
    isProcessing,
    isRecording,
    isSupported,
    isVoiceControlEnabled: settings?.isVoiceControlEnabled,
    maxReferenceCount,
    maxSuggestions,
    modelDropdownRef,
    models,
    normalizedWatchedModels,
    onCancel,
    onDocumentChange: handlePromptDocumentChange,
    openAttachedAssetsBrowser,
    openGallery,
    openUpload,
    pathname,
    previousPrompt,
    profiles,
    promptBarHeight,
    refocusTextarea,
    referenceSource,
    references,
    requiresReferences,
    selectedModelCost,
    generationMeter,
    selectedModels,
    selectedPreset,
    selectedProfile,
    setEndFrame,
    setIsAutoMode,
    setIsCollapsed,
    setReferenceSource,
    setReferences,
    setSelectedPreset,
    setSelectedProfile,
    setTextValue,
    showSuggestionsWhenEmpty,
    subscriptionTier,
    suggestions,
    supportsInterpolation,
    supportsMultipleReferences,
    textareaRef,
    textareaRegister,
    toggleVoice,
    trainings,
    trainingIds,
    triggerConfigChange,
    videoDurations,
    voices,
    watchedDuration,
    watchedFormat,
    watchedHeight,
    watchedModel,
    watchedModels,
    watchedQuality,
    watchedSpeech,
    watchedWidth,
    onSuggestionSelect,
  });

  return {
    crunQuoteLabel,
    crunInputControls,
    watchedCrunControls,
    crunVideoDraft:
      isCrunVideo && watchedCrunControls
        ? {
            modelKey: watchedCrunControls.modelKey,
            contractVersion: watchedCrunControls.contractVersion,
            prompt: form.watch('text') ?? '',
            duration: watchedDuration,
            aspectRatio: watchedCrunControls.aspectRatio,
            resolution: form.watch('resolution') || undefined,
            negativePrompt: watchedCrunControls.negativePrompt,
            guidanceScale: watchedCrunControls.guidanceScale,
            translatePrompt: watchedCrunControls.translatePrompt,
            startFrameId: references[0]?.id,
            endFrameId: endFrame?.id,
          }
        : null,
    // context value (consumed by PromptBarInternalContext.Provider)
    internalContextValue,
    // refs for JSX
    promptBarRef,
    collapsedInputRef,
    isInternalUpdateRef,
    // state needed directly in JSX
    isCollapsed,
    setIsCollapsed,
    isCollapsible,
    // form used in JSX
    form,
    // config
    currentConfig,
    // collapsed view props
    isDisabledState,
    isGenerateBlocked,
    selectedModelCost,
    generationMeter,
    handleSubmitForm,
    generateLabel,
    activeGenerations,
    handleTextChange,
    watchedModel,
    formatIcon,
    references,
    referenceSource,
    triggerConfigChange,
    categoryType,
    currentModelCategory,
    isGenerating,
    isGenerateDisabled,
    onCancel,
    // voice
    isSupported,
    settings,
    toggleVoice,
    isRecording,
    isProcessing,
    watchedFormat,
  };
}
