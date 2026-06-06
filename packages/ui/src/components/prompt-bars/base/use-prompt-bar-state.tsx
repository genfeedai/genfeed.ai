'use client';

import {
  getModelDefaultDuration,
  getModelDurations,
} from '@genfeedai/constants';
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
} from '@genfeedai/enums';
import {
  getDefaultVideoResolution,
  hasResolutionOptions,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSpeechRecording } from '@genfeedai/hooks/media/use-speech-recording/use-speech-recording';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { usePromptBarEnhancement } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-enhancement/use-prompt-bar-enhancement';
import { usePromptBarFilters } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-filters/use-prompt-bar-filters';
import { usePromptBarForm } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-form/use-prompt-bar-form';
import { usePromptBarModels } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-models/use-prompt-bar-models';
import { usePromptBarPricing } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-pricing/use-prompt-bar-pricing';
import { usePromptBarReferences } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-references/use-prompt-bar-references';
import { usePromptBarSync } from '@genfeedai/hooks/prompt-bar/use-prompt-bar-sync/use-prompt-bar-sync';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type { IAsset, IImage } from '@genfeedai/interfaces';
import type {
  GalleryModalOptions,
  PromptBarAttachedAsset,
  PromptBarProps,
} from '@genfeedai/props/studio/prompt-bar.props';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import {
  getConfigForCategoryType,
  getConfigForRoute,
} from '@ui-constants/media.constant';
import { usePathname, useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';
import {
  EMPTY_ARRAY,
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
  | 'isGenerating'
  | 'isGenerateDisabled'
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
>;

export function usePromptBarState({
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
  isGenerating = false,
  isGenerateDisabled = false,
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
}: UsePromptBarStateParams) {
  const useSplitState = promptText !== undefined && promptConfig !== undefined;
  const isCollapsible = features.collapsible ?? true;
  const hasDragDrop = features.dragDrop ?? true;
  const pathname = usePathname();
  const { push } = useRouter();

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
  const { href: buildHref } = useOrgUrl();
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

  const textareaMaxHeight = isCollapsible ? 300 : 240;
  const resizePromptTextarea = useCallback(
    (textarea: HTMLTextAreaElement | null) => {
      resizeTextarea(textarea, textareaMaxHeight);
    },
    [textareaMaxHeight],
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

  const { selectedModelCost } = usePromptBarPricing({
    selectedModels,
    watchedDuration,
    watchedHeight,
    watchedOutputs,
    watchedWidth,
  });

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
    if (speechError) {
      notificationsService.error(`Voice input error: ${speechError}`);
    }
  }, [speechError, notificationsService]);

  useEffect(() => {
    if (normalizedWatchedModels.length > 0 && !watchedDuration) {
      const defaultDuration = getModelDefaultDuration(watchedModel);
      if (defaultDuration) {
        form.setValue('duration', defaultDuration, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [
    normalizedWatchedModels.length,
    watchedModel,
    watchedDuration,
    form,
    triggerConfigChange,
  ]);

  useEffect(() => {
    if (watchedModel && hasResolutionOptions(watchedModel)) {
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
  }, [watchedModel, form, triggerConfigChange]);

  useEffect(() => {
    if (brandId) {
      form.setValue('brand', brandId, { shouldValidate: true });
    }
  }, [brandId, form]);

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
    watchedAutoSelectModel !== true && normalizedWatchedModels.length === 0;
  const isDisabledState = isDisabled;
  const isGenerateBlocked = isDisabled || isModelNotSet;

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
    if (!currentConfig.buttons?.reference || isOnlyImagenModels) {
      return;
    }

    openGallery({
      category: IngredientCategory.IMAGE,
      format: watchedFormat,
      maxSelectableItems: supportsMultipleReferences ? maxReferenceCount : 1,
      onSelect: (selection) => {
        handleReferenceSelect(
          selection as IAsset | IImage | IAsset[] | IImage[] | null,
        );
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
    handleReferenceSelect,
    handleSelectAccountReference,
    isOnlyImagenModels,
    maxReferenceCount,
    openGallery,
    references,
    supportsMultipleReferences,
    watchedFormat,
  ]);

  const handleSubmitForm = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (
        onSubmit &&
        !isGenerateBlocked &&
        !isGenerateDisabled &&
        !isGenerating
      ) {
        flushConfigChange();
        onSubmit();
      }
    },
    [
      isGenerateBlocked,
      isGenerateDisabled,
      isGenerating,
      onSubmit,
      flushConfigChange,
    ],
  );

  const videoDurations = useMemo(() => {
    if (normalizedWatchedModels.length === 0) {
      return [...getModelDurations(watchedModel as string)];
    }
    return getUnionFromAllModels<number>(((modelKey) => {
      const durations = getModelDurations(modelKey);
      return Array.from(durations);
    }) as (modelKey: string) => number[]);
  }, [normalizedWatchedModels, watchedModel, getUnionFromAllModels]);

  const formatIcon = useMemo(() => {
    switch (watchedFormat) {
      case IngredientFormat.LANDSCAPE:
        return <MdOutlineCropLandscape className="size-4" />;
      case IngredientFormat.SQUARE:
        return <MdOutlineCropSquare className="size-4" />;
      default:
        return <MdOutlineCropPortrait className="size-4" />;
    }
  }, [watchedFormat]);

  const controlClass =
    'h-9 px-2.5 gap-1.5 text-sm flex-shrink-0 !border-transparent !bg-transparent !shadow-none text-white/70 hover:!bg-white/5 hover:!text-white';
  const iconButtonClass =
    'size-9 p-0 flex items-center justify-center !border-transparent !bg-transparent !shadow-none text-white/70 hover:!bg-white/5 hover:!text-white';
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
    openAttachedAssetsBrowser,
    openGallery: openGallery as unknown as (
      options: GalleryModalOptions,
    ) => void,
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
    // voice
    isSupported,
    settings,
    toggleVoice,
    isRecording,
    isProcessing,
    // navigation for collapsed callbacks
    push,
    buildHref,
    watchedFormat,
  };
}
