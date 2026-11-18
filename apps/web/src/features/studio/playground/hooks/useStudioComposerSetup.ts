'use client';

import { isFlux3ImageModel } from '@genfeedai/contracts/constants';
import type { IStudioLook } from '@genfeedai/contracts/interfaces';
import type {
  GenerationSetupFieldKey,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type {
  StudioPlaygroundCapabilities,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import {
  applyGenerationSetupPreset,
  applyGenerationSetupRecommendation,
  buildStudioGenerationSetupScope,
  clearGenerationSetupPreset,
  resetGenerationSetupField,
  setGenerationSetupField,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { useCallback, useEffect } from 'react';
import { recommendGenerationSetup } from '@/features/studio/components/dropdowns/generation-setup/generation-setup.recommend';
import {
  crunFieldOptions,
  type useCrunInputControls,
} from '@/features/studio/playground/hooks/useCrunInputControls';
import { useStudioGenerationSetupLookOptions } from '@/features/studio/playground/hooks/useStudioGenerationSetupLookOptions';
import {
  presetToGenerationSetupValues,
  useStudioLooks,
} from '@/features/studio/playground/hooks/useStudioLooks';
import { getDefaultGenerationSetupValues } from '@/features/studio/playground/utils/studio-generation-setup-bridge';
import { listStudioPlaygroundTypeConfigs } from '@/features/studio/playground/utils/studio-playground-types';
import { useDebounce } from '@/hooks/utils/use-debounce/use-debounce';

/** Debounce window before a prompt edit re-runs the recommendation engine. */
const RECOMMENDATION_DEBOUNCE_MS = 400;

interface UseStudioComposerSetupParams {
  capabilities: StudioPlaygroundCapabilities;
  inputControls: ReturnType<typeof useCrunInputControls>;
  modelKey: string;
  prompt: string;
  type: StudioPlaygroundType;
}

/**
 * The generation setup behind the composer chips: this type's scope in the
 * setup store, the saved Looks, the prompt-driven recommendation, and the
 * handlers that write a field, a preset or a Look back to the store.
 */
export function useStudioComposerSetup({
  capabilities,
  inputControls,
  modelKey,
  prompt,
  type,
}: UseStudioComposerSetupParams) {
  const scope = buildStudioGenerationSetupScope(type);
  const defaults = getDefaultGenerationSetupValues(type);
  const setupFromStore = useGenerationSetupStore(
    (state) => state.setupByScope[scope],
  );
  const reasons =
    useGenerationSetupStore((state) => state.reasonsByScope[scope]) ?? {};
  const setup = setupFromStore ?? { sources: {}, values: defaults };
  const setupForComposer = {
    ...setup,
    values: { ...setup.values, type },
  };
  const {
    deleteLook,
    isLoading: isPresetsLoading,
    looks: presets,
    saveLook,
  } = useStudioLooks(type);
  const incumbentLookOptions = useStudioGenerationSetupLookOptions(
    type,
    modelKey,
  );
  const lookOptions = inputControls
    ? {
        ...incumbentLookOptions,
        resolution:
          inputControls.mediaKind === 'video'
            ? []
            : crunFieldOptions(inputControls, 'resolution').map((key) => ({
                key,
                label: key,
              })),
      }
    : incumbentLookOptions;
  const typeOptions = listStudioPlaygroundTypeConfigs()
    .filter((config) => config.type !== 'image-edit')
    .map((config) => ({
      label: config.label,
      value:
        config.type === 'image' && type === 'image-edit' ? type : config.type,
    }));

  const debouncedPrompt = useDebounce(prompt, RECOMMENDATION_DEBOUNCE_MS);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `recommendGenerationSetup` only reads the type-level capability flags (aspect ratio, duration, model selection, outputs, brand) that stay constant for a given `type`, which is already a dep. `capabilities.hasInstrumentalToggle`/`hasLyrics` do vary with `settings.modelKey`, but nothing this effect reads depends on them, so omitting `settings.modelKey` here doesn't skip a real update — and including capabilities'/defaults' fresh-per-render object identities would re-run this on every render and defeat the debounce.
  useEffect(() => {
    if (type === 'image-edit') return;
    const recommendation = recommendGenerationSetup({
      capabilities,
      lockedType: type,
      prompt: debouncedPrompt,
      type,
    });
    applyGenerationSetupRecommendation(scope, recommendation, defaults);
  }, [debouncedPrompt, scope, type]);

  const handleSetField = useCallback(
    <K extends GenerationSetupFieldKey>(
      key: K,
      value: GenerationSetupValues[K],
    ) => {
      // Type changes which Studio scope is active. The parent switches scopes
      // through onTypeChange; writing it here clears this scope's preset first.
      if (key === 'type') {
        return;
      }
      setGenerationSetupField(scope, key, value, defaults);
      if (
        key === 'modelKey' &&
        typeof value === 'string' &&
        isFlux3ImageModel(value)
      ) {
        setGenerationSetupField(scope, 'resolution', '1k', defaults);
        setGenerationSetupField(scope, 'aspectRatio', 'auto', defaults);
        setGenerationSetupField(scope, 'outputs', 1, defaults);
      }
      if (
        key === 'modelKey' &&
        type === 'video' &&
        typeof value === 'string' &&
        value !== '' &&
        value !== AUTO_MODEL_OPTION_VALUE
      ) {
        setGenerationSetupField(
          scope,
          'resolution',
          getDefaultVideoResolution(value) ?? '',
          defaults,
        );
      }
    },
    [defaults, scope, type],
  );

  const handleResetField = useCallback(
    (key: GenerationSetupFieldKey) =>
      resetGenerationSetupField(scope, key, defaults),
    [defaults, scope],
  );

  const handleClearPreset = useCallback(
    () => clearGenerationSetupPreset(scope),
    [scope],
  );

  const handleApplyPreset = useCallback(
    (preset: IStudioLook) => {
      applyGenerationSetupPreset(
        scope,
        preset.id,
        presetToGenerationSetupValues(preset),
        defaults,
      );
    },
    [defaults, scope],
  );

  const handleSavePreset = useCallback(
    (label: string) => {
      void saveLook(label, setup.values);
    },
    [saveLook, setup],
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      void deleteLook(presetId);
    },
    [deleteLook],
  );

  return {
    defaults,
    handleApplyPreset,
    handleClearPreset,
    handleDeletePreset,
    handleResetField,
    handleSavePreset,
    handleSetField,
    isPresetsLoading,
    lookOptions,
    presets,
    reasons,
    scope,
    setup,
    setupForComposer,
    typeOptions,
  };
}
