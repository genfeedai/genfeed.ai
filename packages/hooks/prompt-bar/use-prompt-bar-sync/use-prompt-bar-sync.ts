import type { PromptTextareaSchema } from '@genfeedai/client/schemas';
import {
  IngredientCategory,
  IngredientFormat,
  ModelCategory,
} from '@genfeedai/enums';
import type { IAsset, IImage } from '@genfeedai/interfaces';
import type {
  UsePromptBarSyncOptions,
  UsePromptBarSyncReturn,
} from '@genfeedai/props/studio/prompt-bar.props';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FieldPath } from 'react-hook-form';

export function usePromptBarSync(
  options: UsePromptBarSyncOptions,
): UsePromptBarSyncReturn {
  const {
    form,
    useSplitState,
    promptText,
    onTextChange,
    onConfigChange,
    onDatasetChange,
    promptData,
    promptConfig,
    externalFormat,
    externalWidth,
    externalHeight,
    categoryType,
    models = [],
    references,
    referenceSource,
    isUserSelectingReferencesRef,
    setReferences,
    setReferenceSource,
    hasInitializedReferencesRef,
  } = options;

  const isExternalUpdateRef = useRef(false);
  const lastPromptDataRef = useRef<typeof promptData>(undefined);
  const lastPromptConfigRef = useRef<typeof promptConfig>(undefined);
  const hasReferencesEffectInitializedRef = useRef(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textValueDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const onConfigChangeRef = useRef(onConfigChange);
  const onDatasetChangeRef = useRef(onDatasetChange);
  const [_textValue, setTextValue] = useState('');

  useEffect(() => {
    onConfigChangeRef.current = onConfigChange;
  }, [onConfigChange]);

  useEffect(() => {
    onDatasetChangeRef.current = onDatasetChange;
  }, [onDatasetChange]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (textValueDebounceTimerRef.current) {
        clearTimeout(textValueDebounceTimerRef.current);
        textValueDebounceTimerRef.current = null;
      }
    };
  }, []);

  const triggerConfigChange = useCallback(() => {
    if (isExternalUpdateRef.current) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const formData = form.getValues() as PromptTextareaSchema;
      const payload = { ...formData, isValid: form.formState.isValid };

      if (useSplitState && onConfigChange) {
        onConfigChange(payload);
      } else {
        onDatasetChangeRef.current?.(payload);
      }
    }, 300);
  }, [form, useSplitState, onConfigChange]);

  const flushConfigChange = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const formData = form.getValues() as PromptTextareaSchema;
    const payload = { ...formData, isValid: form.formState.isValid };

    if (useSplitState && onConfigChangeRef.current) {
      onConfigChangeRef.current(payload);
    } else {
      onDatasetChangeRef.current?.(payload);
    }
  }, [form, useSplitState]);

  const handleTextChange = useCallback(() => {
    if (isExternalUpdateRef.current) {
      return;
    }

    if (useSplitState && onTextChange) {
      const textValue = (form.getValues('text') || '') as string;
      onTextChange(textValue);
    } else {
      triggerConfigChange();
    }
  }, [useSplitState, onTextChange, form, triggerConfigChange]);

  const handleTextareaChange = useCallback(() => {
    if (isExternalUpdateRef.current) {
      return;
    }

    handleTextChange();

    if (textValueDebounceTimerRef.current) {
      clearTimeout(textValueDebounceTimerRef.current);
    }
    textValueDebounceTimerRef.current = setTimeout(() => {
      const currentText = (form.getValues('text') || '').trim();
      setTextValue(currentText);
    }, 150);
  }, [handleTextChange, form]);

  useEffect(() => {
    if (externalFormat && externalWidth && externalHeight) {
      form.setValue('format', externalFormat, { shouldValidate: true });
      form.setValue('width', externalWidth, { shouldValidate: true });
      form.setValue('height', externalHeight, { shouldValidate: true });
    }
  }, [externalFormat, externalWidth, externalHeight, form]);

  useEffect(() => {
    if (!promptConfig) {
      lastPromptConfigRef.current = undefined;
    }
  }, [promptConfig]);

  useEffect(() => {
    if (!useSplitState || promptText === undefined) {
      return;
    }

    const currentFormText = form.getValues('text');
    if (promptText === currentFormText) {
      return;
    }

    isExternalUpdateRef.current = true;
    form.setValue('text', promptText, { shouldValidate: true });
    setTextValue(promptText.trim());

    queueMicrotask(() => {
      isExternalUpdateRef.current = false;
    });
  }, [form, promptText, useSplitState]);

  useEffect(() => {
    if (!useSplitState || !promptConfig) {
      return;
    }
    if (promptConfig === lastPromptConfigRef.current) {
      return;
    }
    lastPromptConfigRef.current = promptConfig;
    if (isExternalUpdateRef.current) {
      return;
    }

    isExternalUpdateRef.current = true;

    const syncField = (
      field: keyof PromptTextareaSchema,
      defaultValue?: unknown,
    ): void => {
      const configValue = (promptConfig as Record<string, unknown>)[field];
      if (configValue === undefined) {
        return;
      }
      const current = form.getValues(field) ?? defaultValue;
      if (current !== configValue) {
        form.setValue(
          field as FieldPath<PromptTextareaSchema>,
          configValue as PromptTextareaSchema[keyof PromptTextareaSchema],
          {
            shouldValidate: true,
          },
        );
      }
    };

    syncField('format');
    syncField('width');
    syncField('height');
    syncField('duration');
    syncField('quality');
    syncField('resolution');
    syncField('outputs');
    const normalizedBrandingMode =
      promptConfig.brandingMode ||
      (promptConfig.isBrandingEnabled ? 'brand' : 'off');
    if (form.getValues('brandingMode') !== normalizedBrandingMode) {
      form.setValue('brandingMode', normalizedBrandingMode, {
        shouldValidate: true,
      });
    }
    syncField('isAudioEnabled', true);
    syncField('autoSelectModel');
    syncField('prioritize');
    syncField('category');

    if (promptConfig.models !== undefined) {
      const currentModels = form.getValues('models') || [];
      const configModels = Array.isArray(promptConfig.models)
        ? promptConfig.models
        : [];

      const modelsChanged =
        currentModels.length !== configModels.length ||
        currentModels.some(
          (model: string, idx: number) => model !== configModels[idx],
        );
      if (modelsChanged) {
        form.setValue('models', configModels, { shouldValidate: true });
      }
    }

    const stringFields = [
      'fontFamily',
      'camera',
      'mood',
      'scene',
      'style',
      'lighting',
      'lens',
      'cameraMovement',
      'speech',
      'avatarId',
      'voiceId',
      'sceneDescription',
      'endFrame',
      'prompt_template',
    ] as const;
    stringFields.forEach((field) => syncField(field));

    const syncArrayField = (field: 'blacklist' | 'sounds' | 'tags'): void => {
      if (promptConfig[field] === undefined) {
        return;
      }
      const currentArray = form.getValues(field) || [];
      const configArray = Array.isArray(promptConfig[field])
        ? (promptConfig[field] as string[])
        : [];
      const arraysChanged =
        currentArray.length !== configArray.length ||
        currentArray.some(
          (item: string, idx: number) => item !== configArray[idx],
        );
      if (arraysChanged) {
        form.setValue(field, configArray, { shouldValidate: true });
      }
    };

    syncArrayField('blacklist');
    syncArrayField('sounds');
    syncArrayField('tags');

    const shouldSyncReferences =
      promptConfig.references !== undefined &&
      referenceSource !== 'brand' &&
      !isUserSelectingReferencesRef.current;

    if (shouldSyncReferences) {
      const currentReferences = form.getValues('references') || [];
      const configReferences: string[] = Array.isArray(promptConfig.references)
        ? (promptConfig.references as string[])
        : [];

      const refsChanged =
        currentReferences.length !== configReferences.length ||
        currentReferences.some(
          (ref: string, idx: number) => ref !== configReferences[idx],
        );

      if (refsChanged) {
        form.setValue('references', configReferences, { shouldValidate: true });

        if (configReferences.length > 0) {
          const referenceObjects = configReferences
            .filter(
              (refId: string): refId is string => typeof refId === 'string',
            )
            .map((refId: string) => ({ id: refId }));

          const needsUpdate =
            references.length !== referenceObjects.length ||
            references.some(
              (ref: IAsset | IImage, idx: number) =>
                ref.id !== referenceObjects[idx]?.id,
            );

          if (needsUpdate && referenceObjects.length > 0) {
            setReferences(referenceObjects as (IAsset | IImage)[]);
            setReferenceSource('ingredient');
            hasInitializedReferencesRef.current = true;
          }
        } else if (references.length > 0) {
          setReferences([]);
          setReferenceSource('');
        }
      }
    }

    queueMicrotask(() => {
      isExternalUpdateRef.current = false;
    });
  }, [
    useSplitState,
    promptConfig,
    form,
    references,
    referenceSource,
    isUserSelectingReferencesRef,
    setReferences,
    setReferenceSource,
    hasInitializedReferencesRef,
  ]);

  useEffect(() => {
    if (!promptData || promptData === lastPromptDataRef.current) {
      return;
    }

    const currentFormText = form.getValues('text');
    const currentFormReferences = form.getValues('references') || [];
    const hasTextChange =
      promptData.text !== undefined && promptData.text !== currentFormText;
    const hasReferencesChange =
      promptData.references !== undefined &&
      JSON.stringify(promptData.references) !==
        JSON.stringify(currentFormReferences);

    if (!hasTextChange && !hasReferencesChange) {
      lastPromptDataRef.current = promptData;
      return;
    }

    isExternalUpdateRef.current = true;

    if (promptData.text != null) {
      const textValue = promptData.text;
      form.setValue('text', textValue, { shouldValidate: true });
      setTextValue(typeof textValue === 'string' ? textValue.trim() : '');
    }

    const fieldsToSync = [
      'style',
      'mood',
      'camera',
      'fontFamily',
      'blacklist',
      'sounds',
      'scene',
      'references',
      'prioritize',
    ] as const;

    fieldsToSync.forEach((field) => {
      if (promptData[field] !== undefined) {
        form.setValue(field, promptData[field], { shouldValidate: true });
      }
    });

    queueMicrotask(() => {
      isExternalUpdateRef.current = false;
    });

    lastPromptDataRef.current = promptData;
  }, [promptData, form]);

  useEffect(() => {
    if (!categoryType) {
      return;
    }

    setReferences([]);
    setReferenceSource('');
    form.setValue('references', [], { shouldValidate: true });
    form.setValue('format', IngredientFormat.PORTRAIT, {
      shouldValidate: true,
    });
    form.setValue('width', 1080, { shouldValidate: true });
    form.setValue('height', 1920, { shouldValidate: true });
  }, [categoryType, form, setReferences, setReferenceSource]);

  useEffect(() => {
    if (!categoryType || models.length === 0) {
      return;
    }

    const categoryToModelMap: Partial<
      Record<IngredientCategory, ModelCategory>
    > = {
      [IngredientCategory.VIDEO]: ModelCategory.VIDEO,
      [IngredientCategory.IMAGE]: ModelCategory.IMAGE,
      [IngredientCategory.MUSIC]: ModelCategory.MUSIC,
    };

    const expectedModelCategory =
      categoryToModelMap[categoryType as IngredientCategory];
    if (!expectedModelCategory) {
      return;
    }

    const currentModels = form.getValues('models') || [];
    if (currentModels.length === 0) {
      return;
    }

    const compatibleModels = currentModels.filter((modelKey: string) => {
      const model = models.find(
        (m: { key: string; category?: ModelCategory }) => m.key === modelKey,
      );
      return model?.category === expectedModelCategory;
    });

    if (compatibleModels.length !== currentModels.length) {
      form.setValue('models', compatibleModels, { shouldValidate: true });
    }
  }, [categoryType, models, form]);

  useEffect(() => {
    if (!hasReferencesEffectInitializedRef.current) {
      hasReferencesEffectInitializedRef.current = true;
      return;
    }

    if (isExternalUpdateRef.current) {
      return;
    }

    triggerConfigChange();
  }, [triggerConfigChange]);

  return {
    debounceTimerRef,
    flushConfigChange,
    handleTextareaChange,
    handleTextChange,
    hasReferencesEffectInitializedRef,
    isExternalUpdateRef,
    lastPromptConfigRef,
    lastPromptDataRef,
    onConfigChangeRef,
    onDatasetChangeRef,
    setTextValue,
    textValueDebounceTimerRef,
    triggerConfigChange,
  };
}
