'use client';

import {
  getModelDefaultDuration,
  getModelDurations,
  getModelMaxOutputs,
} from '@genfeedai/constants';
import { useAssetSelection } from '@genfeedai/contexts/ui/asset-selection-context';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
  type QualityTier,
  type SubscriptionTier,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
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
import type { IAsset, IImage, IIngredient } from '@genfeedai/interfaces';
import type {
  GalleryModalOptions,
  PromptBarAttachedAsset,
  PromptBarProps,
} from '@genfeedai/props/studio/prompt-bar.props';
import {
  useGalleryModal,
  useUploadModal,
} from '@genfeedai/providers/global-modals/global-modals.provider';
import { PromptsService } from '@genfeedai/services/content/prompts.service';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import PromptBarCollapsedView from '@ui/prompt-bars/components/collapsed-view/PromptBarCollapsedView';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import PromptBarUnifiedView from '@ui/prompt-bars/components/unified-view/PromptBarUnifiedView';
import {
  getConfigForCategoryType,
  getConfigForRoute,
} from '@ui-constants/media.constant';
import { usePathname, useRouter } from 'next/navigation';
import type { DragEvent, FormEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';

function getAspectRatioFromFormat(format: IngredientFormat): string {
  switch (format) {
    case IngredientFormat.PORTRAIT:
      return '9:16';
    case IngredientFormat.SQUARE:
      return '1:1';
    default:
      return '16:9';
  }
}

function resizeTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight: number,
): void {
  if (!textarea) {
    return;
  }
  textarea.style.height = 'auto';

  if (textarea.scrollHeight > maxHeight) {
    textarea.style.height = `${maxHeight}px`;
    textarea.style.overflowY = 'auto';
  } else {
    textarea.style.height = `${textarea.scrollHeight}px`;
    textarea.style.overflowY = 'hidden';
  }
}

function isFileDrag(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function toAttachedPromptAsset(
  asset: IAsset | IImage,
  role: 'reference' | 'startFrame' | 'endFrame',
  source: 'upload' | 'library',
): PromptBarAttachedAsset {
  return {
    id: asset.id as string,
    kind: 'image',
    name:
      ('title' in asset && typeof asset.title === 'string' && asset.title) ||
      ('name' in asset && typeof asset.name === 'string' && asset.name) ||
      undefined,
    previewUrl:
      ('ingredientUrl' in asset && typeof asset.ingredientUrl === 'string'
        ? asset.ingredientUrl
        : undefined) || undefined,
    role,
    source,
  };
}

function normalizeUploadedReference(
  uploaded: IIngredient | IAsset,
): IAsset | IImage | null {
  if (!uploaded?.id) {
    return null;
  }

  const maybeUploaded = uploaded as unknown as Record<string, unknown>;

  return {
    id: uploaded.id,
    ingredientUrl:
      typeof maybeUploaded.ingredientUrl === 'string'
        ? maybeUploaded.ingredientUrl
        : undefined,
    metadataHeight:
      typeof maybeUploaded.metadataHeight === 'number'
        ? maybeUploaded.metadataHeight
        : undefined,
    metadataWidth:
      typeof maybeUploaded.metadataWidth === 'number'
        ? maybeUploaded.metadataWidth
        : undefined,
    name:
      typeof maybeUploaded.name === 'string' ? maybeUploaded.name : undefined,
    title:
      typeof maybeUploaded.title === 'string' ? maybeUploaded.title : undefined,
  } as unknown as IAsset | IImage;
}

function PromptBar({
  isDisabled = false,
  models = [],
  trainings = [],
  presets = [],
  folders = [],
  profiles = [],
  moods = [],
  styles = [],
  cameras = [],
  scenes = [],
  fontFamilies = [],
  blacklists = [],
  sounds = [],
  lightings = [],
  lenses = [],
  cameraMovements = [],
  avatars = [],
  voices = [],
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
  shellMode = 'legacy-collapsible',
  suggestions,
  onSuggestionSelect,
  showSuggestionsWhenEmpty = true,
  maxSuggestions = 3,
}: PromptBarProps) {
  const useSplitState = promptText !== undefined && promptConfig !== undefined;
  const isUnifiedShell = shellMode === 'studio-unified';
  const pathname = usePathname();
  const router = useRouter();

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
  const [isCollapsed, setIsCollapsed] = useState(!isUnifiedShell);
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
  const [attachedPromptAssets, setAttachedPromptAssets] = useState<
    PromptBarAttachedAsset[]
  >([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  const textareaMaxHeight = isUnifiedShell ? 240 : 300;
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
  const watchedModels = watchedModelsValue || [];
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

    setAttachedPromptAssets(nextAttachedAssets);
  }, [currentModelCategory, endFrame, referenceSource, references]);

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
    if (isUnifiedShell || hasExpandedRef.current) {
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
  }, [currentConfig.defaultModel, isCollapsed, isUnifiedShell, models.length]);

  useEffect(() => {
    if (filteredBlacklists?.length > 0) {
      const currentBlacklists = form.getValues('blacklist') || [];
      const defaultKeys = filteredBlacklists
        .filter((b) => b.isDefault)
        .map((b) => b.key);
      if (defaultKeys.length > 0 && currentBlacklists.length === 0) {
        form.setValue('blacklist', defaultKeys, { shouldValidate: true });
        triggerConfigChange();
      }
    }
  }, [filteredBlacklists, form, triggerConfigChange]);

  useEffect(() => {
    if (filteredSounds?.length > 0) {
      const currentSounds = form.getValues('sounds') || [];
      const defaultKeys = filteredSounds
        .filter((s) => s.isDefault && s.key !== undefined)
        .map((s) => s.key)
        .filter((key): key is string => key !== undefined);

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
      selectedReferences: references
        .map((reference) => reference.id)
        .filter((id): id is string => Boolean(id)),
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

  const handleRemoveAttachedAsset = useCallback(
    (assetId: string) => {
      if (endFrame?.id === assetId) {
        setEndFrame(null);
        form.setValue('endFrame', '', { shouldValidate: true });
        triggerConfigChange();
        return;
      }

      const updatedReferences = references.filter(
        (reference) => reference.id !== assetId,
      );
      setReferences(updatedReferences);
      setReferenceSource(updatedReferences.length > 0 ? referenceSource : '');
      form.setValue(
        'references',
        updatedReferences
          .map((reference) => reference.id)
          .filter((id): id is string => Boolean(id)),
        { shouldValidate: true },
      );
      triggerConfigChange();
    },
    [
      endFrame,
      form,
      referenceSource,
      references,
      setEndFrame,
      setReferenceSource,
      setReferences,
      triggerConfigChange,
    ],
  );

  const handlePromptBarDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        isDisabledState ||
        !currentConfig.buttons?.reference ||
        isOnlyImagenModels ||
        !isFileDrag(event)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current += 1;
      setDragError(null);
      setIsDragActive(true);
    },
    [currentConfig.buttons, isDisabledState, isOnlyImagenModels],
  );

  const handlePromptBarDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragActive(false);
      }
    },
    [],
  );

  const handleDroppedUploadComplete = useCallback(
    (uploadedIngredients: (IIngredient | IAsset)[]) => {
      const uploadedReferences = uploadedIngredients
        .map((uploaded) => normalizeUploadedReference(uploaded))
        .filter(
          (reference): reference is IAsset | IImage => reference !== null,
        );

      if (uploadedReferences.length === 0) {
        return;
      }

      if (!supportsMultipleReferences) {
        handleReferenceSelect(
          uploadedReferences[uploadedReferences.length - 1],
        );
        triggerConfigChange();
        return;
      }

      const mergedReferences = [
        ...references.filter(
          (existingReference) =>
            !uploadedReferences.some(
              (uploaded) => uploaded.id === existingReference.id,
            ),
        ),
        ...uploadedReferences,
      ].slice(0, maxReferenceCount);

      handleReferenceSelect(mergedReferences as IAsset[] | IImage[]);
      triggerConfigChange();
    },
    [
      handleReferenceSelect,
      maxReferenceCount,
      references,
      supportsMultipleReferences,
      triggerConfigChange,
    ],
  );

  const handleDroppedFiles = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragActive(false);

      if (
        isDisabledState ||
        !currentConfig.buttons?.reference ||
        isOnlyImagenModels
      ) {
        return;
      }

      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length === 0) {
        return;
      }

      const validImageFiles = droppedFiles.filter((file) =>
        file.type.startsWith('image/'),
      );

      if (validImageFiles.length === 0) {
        setDragError(
          'Only image files can be attached as references in the studio prompt bar.',
        );
        return;
      }

      const filesToUpload = supportsMultipleReferences
        ? validImageFiles.slice(0, maxReferenceCount)
        : validImageFiles.slice(-1);

      setDragError(null);
      openUpload({
        autoSubmit: true,
        category: IngredientCategory.IMAGE,
        height: watchedHeight,
        initialFiles: filesToUpload,
        isMultiple: supportsMultipleReferences,
        maxFiles: supportsMultipleReferences ? maxReferenceCount : 1,
        onComplete: handleDroppedUploadComplete,
        width: watchedWidth,
      });
    },
    [
      currentConfig.buttons,
      handleDroppedUploadComplete,
      isDisabledState,
      isOnlyImagenModels,
      maxReferenceCount,
      openUpload,
      supportsMultipleReferences,
      watchedHeight,
      watchedWidth,
    ],
  );

  const handleSubmitForm = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (onSubmit && !isGenerateDisabled && !isGenerating) {
        flushConfigChange();
        onSubmit();
      }
    },
    [isGenerateDisabled, isGenerating, onSubmit, flushConfigChange],
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
        return <MdOutlineCropLandscape className="w-4 h-4" />;
      case IngredientFormat.SQUARE:
        return <MdOutlineCropSquare className="w-4 h-4" />;
      default:
        return <MdOutlineCropPortrait className="w-4 h-4" />;
    }
  }, [watchedFormat]);

  const controlClass =
    'h-9 px-2.5 gap-1.5 text-sm flex-shrink-0 !border-transparent !bg-transparent !shadow-none text-white/70 hover:!bg-white/5 hover:!text-white';
  const iconButtonClass =
    'h-9 w-9 p-0 flex items-center justify-center !border-transparent !bg-transparent !shadow-none text-white/70 hover:!bg-white/5 hover:!text-white';
  const textareaRegister = form.register('text');

  return (
    <div className="w-full h-full flex flex-col min-h-0 relative">
      <form
        onSubmit={handleSubmitForm}
        className="flex-1 flex flex-col min-h-0"
      >
        <div
          ref={promptBarRef}
          className={cn(
            'sticky bottom-0 flex-shrink-0 z-50 flex flex-col transition-all duration-300',
            isCollapsed ? 'overflow-hidden' : 'overflow-visible',
          )}
        >
          {isUnifiedShell ? (
            <PromptBarUnifiedView
              currentConfig={currentConfig}
              pathname={pathname}
              categoryType={categoryType}
              currentModelCategory={currentModelCategory}
              form={form}
              isAutoMode={isAutoMode}
              setIsAutoMode={setIsAutoMode}
              isDisabledState={isDisabledState}
              isGenerateBlocked={isGenerateBlocked}
              controlClass={controlClass}
              iconButtonClass={iconButtonClass}
              isAdvancedMode={isAdvancedMode}
              isAdvancedControlsEnabled={isAdvancedControlsEnabled}
              models={models}
              trainings={trainings}
              selectedModels={selectedModels}
              trainingIds={trainingIds}
              normalizedWatchedModels={normalizedWatchedModels}
              watchedModels={watchedModels}
              watchedModel={watchedModel}
              watchedFormat={watchedFormat}
              watchedWidth={watchedWidth}
              watchedHeight={watchedHeight}
              watchedDuration={watchedDuration}
              watchedSpeech={watchedSpeech}
              watchedQuality={watchedQuality}
              subscriptionTier={subscriptionTier}
              isModelNotSet={isModelNotSet}
              hasAudioToggleValue={hasAudioToggle}
              hasSpeechValue={hasSpeech}
              hasModelWithoutDurationEditingValue={
                hasModelWithoutDurationEditing
              }
              hasAnyResolutionOptionsValue={hasAnyResolutionOptions}
              hasEndFrameValue={hasEndFrame}
              hasAnyImagenModelValue={hasAnyImagenModel}
              isOnlyImagenModelsValue={isOnlyImagenModels}
              supportsInterpolation={supportsInterpolation}
              supportsMultipleReferences={supportsMultipleReferences}
              requiresReferences={requiresReferences}
              maxReferenceCount={maxReferenceCount}
              folders={folders}
              profiles={profiles}
              filteredPresets={filteredPresets}
              filteredScenes={filteredScenes}
              filteredFontFamilies={filteredFontFamilies}
              filteredStyles={filteredStyles}
              filteredCameras={filteredCameras}
              filteredLightings={filteredLightings}
              filteredLenses={filteredLenses}
              filteredCameraMovements={filteredCameraMovements}
              filteredMoods={filteredMoods}
              filteredSounds={filteredSounds}
              filteredBlacklists={filteredBlacklists}
              references={references}
              setReferences={setReferences}
              endFrame={endFrame}
              setEndFrame={setEndFrame}
              referenceSource={referenceSource}
              setReferenceSource={setReferenceSource}
              selectedPreset={selectedPreset}
              setSelectedPreset={setSelectedPreset}
              selectedProfile={selectedProfile}
              setSelectedProfile={setSelectedProfile}
              formatIcon={formatIcon}
              videoDurations={videoDurations}
              triggerConfigChange={triggerConfigChange}
              refocusTextarea={refocusTextarea}
              handleTextareaChange={handleTextareaChange}
              onTextChange={onTextChange}
              handleCopy={handleCopy}
              enhancePrompt={enhancePrompt}
              handleUndo={handleUndo}
              handleSubmitForm={handleSubmitForm}
              suggestions={suggestions}
              onSuggestionSelect={onSuggestionSelect}
              showSuggestionsWhenEmpty={showSuggestionsWhenEmpty}
              maxSuggestions={maxSuggestions}
              openGallery={
                openGallery as unknown as (options: GalleryModalOptions) => void
              }
              openUpload={openUpload}
              isDragActive={isDragActive}
              dragError={dragError}
              attachedPromptAssets={attachedPromptAssets}
              onDragEnter={handlePromptBarDragEnter}
              onDragLeave={handlePromptBarDragLeave}
              onDropFiles={handleDroppedFiles}
              onRemoveAttachedAsset={handleRemoveAttachedAsset}
              onBrowseAssets={openAttachedAssetsBrowser}
              textareaRef={textareaRef}
              textareaRegister={textareaRegister}
              modelDropdownRef={modelDropdownRef}
              promptBarHeight={promptBarHeight}
              getModelDefaultDuration={getModelDefaultDuration}
              getDefaultVideoResolution={getDefaultVideoResolution}
              getMinFromAllModels={getMinFromAllModels}
              getModelMaxOutputs={getModelMaxOutputs}
              setTextValue={setTextValue}
              isSupported={
                isSupported && settings?.isVoiceControlEnabled !== false
              }
              toggleVoice={toggleVoice}
              isRecording={isRecording}
              isProcessing={isProcessing}
              isGenerating={isGenerating}
              isEnhancing={isEnhancing}
              isGenerateDisabled={isGenerateDisabled}
              previousPrompt={previousPrompt}
              selectedModelCost={selectedModelCost}
              activeGenerations={activeGenerations}
              generateLabel={generateLabel}
              avatars={avatars}
              voices={voices}
            />
          ) : isCollapsed ? (
            <PromptBarCollapsedView
              collapsedInputRef={collapsedInputRef}
              form={form}
              placeholder={currentConfig.placeholder}
              isDisabled={isDisabledState}
              isGenerateBlocked={isGenerateBlocked}
              isGenerateDisabled={isGenerateDisabled}
              isGenerating={isGenerating}
              selectedModelCost={selectedModelCost}
              onSubmit={handleSubmitForm}
              generateLabel={generateLabel}
              activeGenerationsCount={activeGenerations.length}
              onExpand={() => setIsCollapsed(false)}
              isFormValid={form.formState.isValid}
              isInternalUpdateRef={isInternalUpdateRef}
              onTextChange={handleTextChange}
              watchedModel={watchedModel}
              formatIcon={formatIcon}
              references={references}
              referenceSource={referenceSource}
              outputs={form.watch('outputs') || 1}
              onOutputsChange={(count) => {
                form.setValue('outputs', count, { shouldValidate: true });
                triggerConfigChange();
              }}
              categoryType={categoryType}
              currentModelCategory={currentModelCategory}
              onCreateVariation={
                categoryType === IngredientCategory.IMAGE
                  ? (reference) => {
                      if (!reference) {
                        return;
                      }
                      const format = watchedFormat || IngredientFormat.PORTRAIT;
                      router.push(
                        buildHref(
                          `/studio/image?referenceImageId=${reference.id}&format=${format}`,
                        ),
                      );
                    }
                  : undefined
              }
              onFormatChange={
                categoryType === IngredientCategory.IMAGE ||
                categoryType === IngredientCategory.VIDEO
                  ? (nextFormat) => {
                      if (categoryType === IngredientCategory.IMAGE) {
                        router.push(
                          buildHref(`/studio/image?format=${nextFormat}`),
                        );
                      } else if (categoryType === IngredientCategory.VIDEO) {
                        const aspectRatio =
                          getAspectRatioFromFormat(nextFormat);
                        router.push(
                          buildHref(`/studio/video?aspectRatio=${aspectRatio}`),
                        );
                      }
                    }
                  : undefined
              }
              isSupported={
                isSupported && settings?.isVoiceControlEnabled !== false
              }
              toggleVoice={toggleVoice}
              isRecording={isRecording}
              isProcessing={isProcessing}
            />
          ) : (
            <PromptBarExpandedView
              currentConfig={currentConfig}
              pathname={pathname}
              categoryType={categoryType}
              form={form}
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
              isAutoMode={isAutoMode}
              setIsAutoMode={setIsAutoMode}
              isDisabledState={isDisabledState}
              isGenerateBlocked={isGenerateBlocked}
              controlClass={controlClass}
              iconButtonClass={iconButtonClass}
              isAdvancedMode={isAdvancedMode}
              isAdvancedControlsEnabled={isAdvancedControlsEnabled}
              models={models}
              trainings={trainings}
              selectedModels={selectedModels}
              trainingIds={trainingIds}
              normalizedWatchedModels={normalizedWatchedModels}
              watchedModels={watchedModels}
              watchedModel={watchedModel}
              watchedFormat={watchedFormat}
              watchedWidth={watchedWidth}
              watchedHeight={watchedHeight}
              watchedDuration={watchedDuration}
              watchedSpeech={watchedSpeech}
              watchedQuality={watchedQuality}
              subscriptionTier={subscriptionTier}
              isModelNotSet={isModelNotSet}
              hasAudioToggleValue={hasAudioToggle}
              hasSpeechValue={hasSpeech}
              hasModelWithoutDurationEditingValue={
                hasModelWithoutDurationEditing
              }
              hasAnyResolutionOptionsValue={hasAnyResolutionOptions}
              hasEndFrameValue={hasEndFrame}
              hasAnyImagenModelValue={hasAnyImagenModel}
              isOnlyImagenModelsValue={isOnlyImagenModels}
              supportsInterpolation={supportsInterpolation}
              supportsMultipleReferences={supportsMultipleReferences}
              requiresReferences={requiresReferences}
              maxReferenceCount={maxReferenceCount}
              folders={folders}
              profiles={profiles}
              filteredPresets={filteredPresets}
              filteredScenes={filteredScenes}
              filteredFontFamilies={filteredFontFamilies}
              filteredStyles={filteredStyles}
              filteredCameras={filteredCameras}
              filteredLightings={filteredLightings}
              filteredLenses={filteredLenses}
              filteredCameraMovements={filteredCameraMovements}
              filteredMoods={filteredMoods}
              filteredSounds={filteredSounds}
              filteredBlacklists={filteredBlacklists}
              references={references}
              setReferences={setReferences}
              endFrame={endFrame}
              setEndFrame={setEndFrame}
              referenceSource={referenceSource}
              setReferenceSource={setReferenceSource}
              selectedPreset={selectedPreset}
              setSelectedPreset={setSelectedPreset}
              selectedProfile={selectedProfile}
              setSelectedProfile={setSelectedProfile}
              formatIcon={formatIcon}
              videoDurations={videoDurations}
              triggerConfigChange={triggerConfigChange}
              refocusTextarea={refocusTextarea}
              handleTextareaChange={handleTextareaChange}
              onTextChange={onTextChange}
              handleCopy={handleCopy}
              enhancePrompt={enhancePrompt}
              handleUndo={handleUndo}
              handleSubmitForm={handleSubmitForm}
              suggestions={suggestions}
              onSuggestionSelect={onSuggestionSelect}
              showSuggestionsWhenEmpty={showSuggestionsWhenEmpty}
              maxSuggestions={maxSuggestions}
              openGallery={
                openGallery as unknown as (options: GalleryModalOptions) => void
              }
              openUpload={openUpload}
              isDragActive={isDragActive}
              dragError={dragError}
              attachedPromptAssets={attachedPromptAssets}
              onDragEnter={handlePromptBarDragEnter}
              onDragLeave={handlePromptBarDragLeave}
              onDropFiles={handleDroppedFiles}
              onRemoveAttachedAsset={handleRemoveAttachedAsset}
              onBrowseAssets={openAttachedAssetsBrowser}
              textareaRef={textareaRef}
              textareaRegister={textareaRegister}
              modelDropdownRef={modelDropdownRef}
              promptBarHeight={promptBarHeight}
              getModelDefaultDuration={getModelDefaultDuration}
              getDefaultVideoResolution={getDefaultVideoResolution}
              getMinFromAllModels={getMinFromAllModels}
              getModelMaxOutputs={getModelMaxOutputs}
              setTextValue={setTextValue}
              isSupported={
                isSupported && settings?.isVoiceControlEnabled !== false
              }
              toggleVoice={toggleVoice}
              isRecording={isRecording}
              isProcessing={isProcessing}
              isGenerating={isGenerating}
              isEnhancing={isEnhancing}
              isGenerateDisabled={isGenerateDisabled}
              previousPrompt={previousPrompt}
              selectedModelCost={selectedModelCost}
              activeGenerations={activeGenerations}
              generateLabel={generateLabel}
              currentModelCategory={currentModelCategory}
              avatars={avatars}
              voices={voices}
            />
          )}
        </div>
      </form>
    </div>
  );
}

export default memo(PromptBar);
