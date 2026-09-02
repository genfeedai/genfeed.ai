'use client';

import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  VideoUpscaleModelOption,
  VideoUpscaleSelection,
} from '@genfeedai/hooks/ui/ingredient/use-enhance-upscale/use-enhance-upscale';
import {
  isTopazVideoUpscaleFps,
  isTopazVideoUpscaleResolution,
  quoteTopazVideoUpscaleCredits,
} from '@genfeedai/pricing';
import FormControl from '@ui/primitives/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface VideoUpscaleConfirmControlsProps {
  modelOptions: VideoUpscaleModelOption[];
  onChange: (selection: VideoUpscaleSelection) => void;
}

function getDefaultModel(options: VideoUpscaleModelOption[]) {
  return (
    options.find(
      (option) => option.key === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
    ) ?? options[0]
  );
}

function getQuote(
  option: VideoUpscaleModelOption,
  resolution: string,
  fps: number,
): number {
  if (
    option.key === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE &&
    isTopazVideoUpscaleResolution(resolution) &&
    isTopazVideoUpscaleFps(fps)
  ) {
    return quoteTopazVideoUpscaleCredits(option.cost, resolution, fps);
  }
  return option.cost;
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
    cost: getQuote(option, targetResolution, targetFps),
    model: option.key,
    targetFps,
    targetResolution,
  };
}

export default function VideoUpscaleConfirmControls({
  modelOptions,
  onChange,
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

  const cost = useMemo(
    () =>
      selectedModel ? getQuote(selectedModel, targetResolution, targetFps) : 0,
    [selectedModel, targetFps, targetResolution],
  );

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
    <div className="space-y-3 rounded-lg border border-border p-4">
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

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {translate('quotedCharge', { cost: formatNumberWithCommas(cost) })}
      </p>
    </div>
  );
}
