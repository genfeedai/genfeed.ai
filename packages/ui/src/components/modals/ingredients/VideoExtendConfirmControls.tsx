'use client';

import { hasNativeExtend } from '@genfeedai/contracts/constants';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  VideoExtendModelOption,
  VideoExtendSelection,
} from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { quoteVideoExtensionCredits } from '@genfeedai/pricing';
import FormControl from '@ui/primitives/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const DURATION_OPTIONS = [4, 8, 12] as const;
const DEFAULT_PROMPT = 'Continue naturally from the final frame.';

interface VideoExtendConfirmControlsProps {
  modelOptions: VideoExtendModelOption[];
  onChange: (selection: VideoExtendSelection) => void;
}

function quoteExtension(model: VideoExtendModelOption, duration: number) {
  return quoteVideoExtensionCredits({
    cost: model.cost,
    costPerUnit: model.costPerUnit,
    dispatchMode: hasNativeExtend(model.key) ? 'native' : 'fabricated',
    duration,
    minCost: model.minCost,
    modelKey: model.key,
    pricingType: model.pricingType,
  });
}

function getDurationOptions(model: VideoExtendModelOption): readonly number[] {
  const published = [...new Set(model.durations ?? [])].filter(
    (duration) => Number.isInteger(duration) && duration >= 1 && duration <= 30,
  );
  return published.length > 0 ? published : DURATION_OPTIONS;
}

function getDefaultDuration(model: VideoExtendModelOption): number {
  const options = getDurationOptions(model);
  if (
    model.defaultDuration !== undefined &&
    options.includes(model.defaultDuration)
  ) {
    return model.defaultDuration;
  }
  return options.includes(8) ? 8 : (options[0] ?? 8);
}

export function getDefaultVideoExtendSelection(
  modelOptions: VideoExtendModelOption[],
): VideoExtendSelection | undefined {
  const model = modelOptions[0];
  if (!model) {
    return undefined;
  }
  const duration = getDefaultDuration(model);
  return {
    cost: quoteExtension(model, duration),
    duration,
    model: model.key,
    prompt: DEFAULT_PROMPT,
  };
}

export default function VideoExtendConfirmControls({
  modelOptions,
  onChange,
}: VideoExtendConfirmControlsProps) {
  const translate = useTranslations('common.videoCreativeActions.extend');
  const initial = getDefaultVideoExtendSelection(modelOptions);
  const [modelKey, setModelKey] = useState(initial?.model ?? '');
  const [duration, setDuration] = useState(initial?.duration ?? 8);
  const [prompt, setPrompt] = useState(initial?.prompt ?? DEFAULT_PROMPT);
  const model =
    modelOptions.find((option) => option.key === modelKey) ?? modelOptions[0];
  const durationOptions = useMemo(
    () => (model ? getDurationOptions(model) : DURATION_OPTIONS),
    [model],
  );
  const cost = useMemo(
    () => (model ? quoteExtension(model, duration) : 0),
    [duration, model],
  );
  const isNative = hasNativeExtend(model?.key ?? '');

  useEffect(() => {
    if (!model) {
      return;
    }
    onChange({ cost, duration, model: model.key, prompt });
  }, [cost, duration, model, onChange, prompt]);

  if (!model) {
    return null;
  }

  const handleModelChange = (nextModelKey: string) => {
    const nextModel = modelOptions.find(
      (option) => option.key === nextModelKey,
    );
    if (!nextModel) {
      return;
    }
    setModelKey(nextModel.key);
    setDuration(getDefaultDuration(nextModel));
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <FormControl label={translate('continuationPromptLabel')}>
        <Textarea
          name="video-extension-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={translate('continuationPromptPlaceholder')}
          className="min-h-20"
        />
      </FormControl>

      <div className="grid grid-cols-2 gap-3">
        <FormControl label={translate('generationModelLabel')}>
          <Select value={model.key} onValueChange={handleModelChange}>
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

        <FormControl label={translate('newClipDurationLabel')}>
          <Select
            value={String(duration)}
            onValueChange={(value) => setDuration(Number(value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durationOptions.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {translate('durationSeconds', { seconds })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormControl>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {translate('summary', {
          cost: formatNumberWithCommas(cost),
          mode: translate(isNative ? 'nativeMode' : 'fabricatedMode'),
        })}
      </p>
    </div>
  );
}
