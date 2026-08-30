'use client';

import type { GenerationSetupLookOptions } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { PRESET_TO_TEMPLATE_MAP } from '@pages/studio/generate/utils/generation-payloads';
import { getStudioResolutions } from '@pages/studio/generate/utils/studio-generate-settings';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import { useMemo } from 'react';
import type { StudioGenerateType } from '../types';

interface LookElement {
  description?: string;
  key: string;
  label: string;
}

interface LookDropdownOption {
  description?: string;
  key: string;
  label: string;
}

function toDropdownOptions(
  items: readonly LookElement[],
): LookDropdownOption[] {
  return items.map((item) => ({
    description: item.description,
    key: item.key,
    label: item.label,
  }));
}

/** `'product-photo'` → `'Product Photo'` — no catalog of hand-written labels to keep in sync. */
function titleCaseFromPresetKey(presetKey: string): string {
  return presetKey
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * `promptTemplate` options are the Studio preset keys `buildBaseGenerationPayload`
 * already knows how to translate into a `ContentTemplateKey` — never the
 * enum values themselves, since `settings.promptTemplate` travels as the
 * short preset key until that payload builder maps it.
 */
function getPromptTemplateOptions(
  type: StudioGenerateType,
): LookDropdownOption[] {
  const prefix =
    type === 'video'
      ? 'content.video.'
      : type === 'image'
        ? 'content.image.'
        : null;

  if (!prefix) {
    return [];
  }

  return Object.entries(PRESET_TO_TEMPLATE_MAP)
    .filter(([, templateKey]) => (templateKey as string).startsWith(prefix))
    .map(([presetKey]) => ({
      key: presetKey,
      label: titleCaseFromPresetKey(presetKey),
    }));
}

/**
 * Assembles `GenerationSetupPopoverProps['lookOptions']` for Studio.
 *
 * `GenerationSetupLookSection` renders nothing for a field with no options,
 * so every Look field Studio can actually submit (per `capabilities.hasLook`
 * in `buildStudioPromptData`) needs real option data here — otherwise the
 * whole Look tab silently disappears for image/video.
 */
export function useStudioGenerationSetupLookOptions(
  type: StudioGenerateType,
  modelKey: string,
): GenerationSetupLookOptions {
  const { capabilities } = getStudioGenerateTypeConfig(type);
  const { cameraMovements, cameras, lenses, lightings, moods, scenes, styles } =
    useElements({ type: type === 'video' || type === 'image' ? type : 'all' });

  return useMemo(() => {
    if (!capabilities.hasLook) {
      return {};
    }

    const resolutionOptions = getStudioResolutions(type, modelKey).map(
      (option) => ({ key: option.value, label: option.label }),
    );

    return {
      camera: toDropdownOptions(cameras),
      // Camera movement only ever reaches the payload for video — see
      // `buildVideoPayload` — so image never offers it, matching
      // `buildStudioLookPayload`'s Preset gating.
      cameraMovement:
        type === 'video' ? toDropdownOptions(cameraMovements) : undefined,
      lens: toDropdownOptions(lenses),
      lighting: toDropdownOptions(lightings),
      mood: toDropdownOptions(moods),
      promptTemplate: getPromptTemplateOptions(type),
      resolution: resolutionOptions.length > 0 ? resolutionOptions : undefined,
      scene: toDropdownOptions(scenes),
      style: toDropdownOptions(styles),
    };
  }, [
    capabilities.hasLook,
    cameraMovements,
    cameras,
    lenses,
    lightings,
    modelKey,
    moods,
    scenes,
    styles,
    type,
  ]);
}
