'use client';

import {
  isFlux3Resolution,
  normalizeMusicSettings,
} from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type {
  StudioPlaygroundSettings,
  StudioPlaygroundType,
} from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { resolveModelDurationOptions } from '@genfeedai/helpers/generation-controls.helper';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { useEffect, useState } from 'react';
import type { StudioSettingsPatchHandler } from '@/features/studio/props/studio-playground-composer.props';

interface UseStudioComposerNormalizationParams {
  attachedAssets: readonly PromptBarAttachedAsset[];
  isFlux: boolean;
  isMaiEdit: boolean;
  onRemoveAttachedAsset: (assetId: string) => void;
  onSettingsChange: StudioSettingsPatchHandler;
  selectedModel: IModel | undefined;
  settings: StudioPlaygroundSettings;
  type: StudioPlaygroundType;
}

/**
 * Keeps the settings inside what the selected model accepts: FLUX drops the
 * controls it cannot run, music settings follow the model, and a clip length
 * the resolution cuts off moves to the closest length that still runs.
 */
export function useStudioComposerNormalization({
  attachedAssets,
  isFlux,
  isMaiEdit,
  onRemoveAttachedAsset,
  onSettingsChange,
  selectedModel,
  settings,
  type,
}: UseStudioComposerNormalizationParams): { droppedEditingControls: boolean } {
  const unsupportedEditingControls =
    (isFlux || isMaiEdit) &&
    type === 'image-edit' &&
    (settings.editSeed !== undefined ||
      attachedAssets.some((asset) => asset.role === 'editMask'));
  const [droppedEditingControls, setDroppedEditingControls] = useState(false);
  // use-effect-audit: ignore writes the FLUX and MAI-Image compatible settings through the host settings callback
  useEffect(() => {
    if (!isFlux && !isMaiEdit) {
      setDroppedEditingControls(false);
      return;
    }
    if (unsupportedEditingControls) setDroppedEditingControls(true);
    const patch: Partial<StudioPlaygroundSettings> = {};
    if (settings.outputs !== 1) patch.outputs = 1;
    if (isFlux && !isFlux3Resolution(settings.resolution))
      patch.resolution = '1k';
    if (settings.editSeed !== undefined) patch.editSeed = undefined;
    if (settings.editSize !== undefined) patch.editSize = undefined;
    for (const asset of attachedAssets)
      if (asset.role === 'editMask') onRemoveAttachedAsset(asset.id);
    if (Object.keys(patch).length) onSettingsChange(patch);
  }, [
    isFlux,
    isMaiEdit,
    unsupportedEditingControls,
    settings.outputs,
    settings.resolution,
    settings.editSeed,
    settings.editSize,
    attachedAssets,
    onRemoveAttachedAsset,
    onSettingsChange,
  ]);
  // use-effect-audit: ignore writes normalized music settings through the host settings callback
  useEffect(() => {
    if (type !== 'music') return;
    const normalized = normalizeMusicSettings(settings.modelKey, {
      duration: settings.duration,
      instrumental: settings.instrumental,
      lyrics: settings.lyrics,
    });
    if (
      normalized.duration !== settings.duration ||
      normalized.instrumental !== settings.instrumental ||
      normalized.lyrics !== settings.lyrics
    )
      onSettingsChange(normalized);
  }, [
    type,
    settings.modelKey,
    settings.duration,
    settings.instrumental,
    settings.lyrics,
    onSettingsChange,
  ]);
  // A provider can cap the clip length at some resolutions. When the
  // resolution cuts off the chosen length, keep the closest length it can run
  // instead of submitting a clip the provider rejects.
  // use-effect-audit: ignore writes the closest runnable clip length through the host settings callback
  useEffect(() => {
    if (
      type !== 'video' ||
      !selectedModel ||
      selectedModel.provider === 'crun' ||
      !settings.duration
    )
      return;
    const requested = settings.duration;
    const options = resolveModelDurationOptions(
      selectedModel,
      settings.resolution,
    );
    if (
      options.length === 0 ||
      options.includes(requested) ||
      !resolveModelDurationOptions(selectedModel).includes(requested)
    )
      return;
    onSettingsChange({
      duration: options.reduce((best, candidate) =>
        Math.abs(candidate - requested) < Math.abs(best - requested)
          ? candidate
          : best,
      ),
    });
  }, [
    type,
    selectedModel,
    settings.duration,
    settings.resolution,
    onSettingsChange,
  ]);
  return { droppedEditingControls };
}
