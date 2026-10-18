'use client';

import { hasNativeExtend } from '@genfeedai/contracts/constants';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import type {
  VideoExtendModelOption,
  VideoExtendSelection,
} from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import {
  getVideoExtendDurationOptions,
  getVideoExtendQuote,
} from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/video-extend-admission.util';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_PROMPT = 'Continue naturally from the final frame.';

interface VideoExtendConfirmControlsProps {
  modelOptions: VideoExtendModelOption[];
  onChange: (selection: VideoExtendSelection) => void;
}

function getDefaultDuration(model: VideoExtendModelOption): number | undefined {
  const options = getVideoExtendDurationOptions(model);
  if (
    model.defaultDuration !== undefined &&
    options.includes(model.defaultDuration)
  ) {
    return model.defaultDuration;
  }
  return options.includes(8) ? 8 : options[0];
}

export function getDefaultVideoExtendSelection(
  modelOptions: VideoExtendModelOption[],
): VideoExtendSelection | undefined {
  const model = modelOptions[0];
  if (!model) {
    return undefined;
  }
  const duration = getDefaultDuration(model);
  const cost =
    duration !== undefined ? getVideoExtendQuote(model, duration) : null;
  if (duration === undefined || cost === null) return undefined;
  return {
    cost,
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
  const [duration, setDuration] = useState(initial?.duration);
  const [prompt, setPrompt] = useState(initial?.prompt ?? DEFAULT_PROMPT);
  const model = modelOptions.find((option) => option.key === modelKey);
  const durationOptions = useMemo(
    () => (model ? getVideoExtendDurationOptions(model) : []),
    [model],
  );
  const cost = useMemo(
    () =>
      model && duration !== undefined
        ? getVideoExtendQuote(model, duration)
        : null,
    [duration, model],
  );
  const isNative = hasNativeExtend(model?.key ?? '');

  useEffect(() => {
    if (!model || duration === undefined || cost === null) {
      return;
    }
    onChange({ cost, duration, model: model.key, prompt });
  }, [cost, duration, model, onChange, prompt]);

  if (!model || duration === undefined || cost === null) {
    return null;
  }

  const modelSelectOptions = modelOptions.map((option) => ({
    label: option.label,
    value: option.key,
  }));
  const durationSelectOptions = durationOptions.map((seconds) => ({
    label: translate('durationSeconds', { seconds }),
    value: String(seconds),
  }));

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
    <div className="space-y-3">
      <PromptBarComposer
        data-testid="video-extend-composer"
        density="compact"
        beforeBody={
          <p className="px-3.5 pt-2.5 text-2xs font-medium text-foreground/55">
            {translate('continuationPromptLabel')}
          </p>
        }
      >
        <PromptEditor
          ariaLabel={translate('continuationPromptLabel')}
          value={prompt}
          placeholder={translate('continuationPromptPlaceholder')}
          onValueChange={setPrompt}
          className="min-h-16"
        />
        <PromptBarToolbar
          density="compact"
          leading={
            <>
              <PromptBarCompactSelect
                ariaLabel={translate('generationModelLabel')}
                density="compact"
                options={modelSelectOptions}
                value={model.key}
                onChange={handleModelChange}
              />
              <PromptBarCompactSelect
                ariaLabel={translate('newClipDurationLabel')}
                density="compact"
                options={durationSelectOptions}
                value={String(duration)}
                onChange={(value) => setDuration(Number(value))}
              />
            </>
          }
          trailing={null}
        />
      </PromptBarComposer>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {translate('summary', {
          cost: formatNumberWithCommas(cost),
          mode: translate(isNative ? 'nativeMode' : 'fabricatedMode'),
        })}
      </p>
    </div>
  );
}
