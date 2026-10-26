'use client';

import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  VideoUpscaleModelOption,
  VideoUpscaleSelection,
} from '@genfeedai/hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import { useVideoUpscaleQuote } from '@ui/modals/ingredients/use-video-upscale-quote';
import FormControl from '@ui/primitives/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface VideoUpscaleConfirmControlsProps {
  modelOptions: VideoUpscaleModelOption[];
  onChange: (selection: VideoUpscaleSelection) => void;
  /** The video being upscaled; Topaz is priced from its stored length. */
  videoId: string;
}

function getDefaultModel(options: VideoUpscaleModelOption[]) {
  return (
    options.find(
      (option) => option.key === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
    ) ?? options[0]
  );
}

/**
 * Topaz bills per second of the source video, which only the API knows, so its
 * price comes from the quote endpoint (null until that answers). Other models
 * charge their flat catalog price.
 */
function isServerPriced(option: VideoUpscaleModelOption): boolean {
  return option.key === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE;
}

function getFlatQuote(option: VideoUpscaleModelOption): number | null {
  return isServerPriced(option) ? null : option.cost;
}

export function getDefaultVideoUpscaleSelection(
  options: VideoUpscaleModelOption[],
): VideoUpscaleSelection | undefined {
  const option = getDefaultModel(options);
  if (!option) {
    return undefined;
  }
  const targetResolution = option.resolutions.includes('1080p')
    ? '1080p'
    : (option.resolutions[0] ?? '');
  const targetFps = option.fps.includes(30) ? 30 : (option.fps[0] ?? 30);
  return {
    cost: getFlatQuote(option),
    model: option.key,
    targetFps,
    targetResolution,
  };
}

export default function VideoUpscaleConfirmControls({
  modelOptions,
  onChange,
  videoId,
}: VideoUpscaleConfirmControlsProps) {
  const translate = useTranslations('common.videoCreativeActions.upscale');
  const defaultModel = getDefaultModel(modelOptions);
  const [modelKey, setModelKey] = useState(defaultModel?.key ?? '');
  const selectedModel =
    modelOptions.find((option) => option.key === modelKey) ?? defaultModel;
  const [targetResolution, setTargetResolution] = useState(
    selectedModel?.resolutions.includes('1080p')
      ? '1080p'
      : (selectedModel?.resolutions[0] ?? ''),
  );
  const [targetFps, setTargetFps] = useState(
    selectedModel?.fps.includes(30) ? 30 : (selectedModel?.fps[0] ?? 30),
  );

  const quote = useVideoUpscaleQuote({
    isEnabled: Boolean(
      selectedModel && isServerPriced(selectedModel) && videoId,
    ),
    model: selectedModel?.key ?? '',
    targetFps,
    targetResolution,
    videoId,
  });
  const cost = selectedModel
    ? isServerPriced(selectedModel)
      ? quote.credits
      : selectedModel.cost
    : null;

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    onChange({
      cost,
      model: selectedModel.key,
      targetFps,
      targetResolution,
    });
  }, [cost, onChange, selectedModel, targetFps, targetResolution]);

  const handleModelChange = (nextModelKey: string) => {
    const nextModel = modelOptions.find(
      (option) => option.key === nextModelKey,
    );
    if (!nextModel) {
      return;
    }
    setModelKey(nextModel.key);
    setTargetResolution(
      nextModel.resolutions.includes('1080p')
        ? '1080p'
        : (nextModel.resolutions[0] ?? ''),
    );
    setTargetFps(nextModel.fps.includes(30) ? 30 : (nextModel.fps[0] ?? 30));
  };

  if (!selectedModel) {
    return null;
  }

  return (
    <div className="space-y-3">
      <FormControl label={translate('upscaleModelLabel')}>
        <Select value={selectedModel.key} onValueChange={handleModelChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormControl>

      <div className="grid grid-cols-2 gap-3">
        <FormControl label={translate('targetResolutionLabel')}>
          <Select value={targetResolution} onValueChange={setTargetResolution}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedModel.resolutions.map((resolution) => (
                <SelectItem key={resolution} value={resolution}>
                  {resolution.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormControl>

        <FormControl label={translate('targetFrameRateLabel')}>
          <Select
            value={String(targetFps)}
            onValueChange={(value) => setTargetFps(Number(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectedModel.fps.map((fps) => (
                <SelectItem key={fps} value={String(fps)}>
                  {translate('framesPerSecond', { fps })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormControl>
      </div>

      {quote.isFailed ? (
        <p role="alert" className="text-xs text-destructive">
          {translate('quoteUnavailable')}
        </p>
      ) : null}
    </div>
  );
}
