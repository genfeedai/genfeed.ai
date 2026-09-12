'use client';

import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupOutputSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import {
  GENERATION_SETUP_ASPECT_RATIO_OPTIONS,
  GENERATION_SETUP_DURATION_OPTIONS_SECONDS,
  GENERATION_SETUP_MUSIC_DURATION_OPTIONS_SECONDS,
  GENERATION_SETUP_OUTPUTS_OPTIONS,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

/**
 * Resolves the duration options (and whether duration is editable at all)
 * for the currently selected music model — providers disagree on both the
 * legal step grid (MusicGen: 5-30s; Eleven Music/Mureka: 10-90s) and whether
 * duration is even a real parameter (Lyria 3 Pro's fal schema silently
 * drops it). Falls back to the widest cross-provider grid when no specific
 * model is resolved yet (auto-select).
 */
function resolveMusicDurationState(modelKey: string): {
  hasDurationEditing: boolean;
  options: readonly number[];
} {
  const capability = MODEL_OUTPUT_CAPABILITIES[modelKey];
  const musicCapability =
    capability?.category === ModelCategory.MUSIC ? capability : undefined;
  if (!musicCapability) {
    return {
      hasDurationEditing: true,
      options: GENERATION_SETUP_MUSIC_DURATION_OPTIONS_SECONDS,
    };
  }
  return {
    hasDurationEditing: musicCapability.hasDurationEditing ?? true,
    options: musicCapability.durations?.length
      ? musicCapability.durations
      : GENERATION_SETUP_MUSIC_DURATION_OPTIONS_SECONDS,
  };
}

/** Nearest legal option to `value` — used to snap a stale duration instead of silently sending an out-of-range one. */
function snapToNearestOption(
  value: number | undefined,
  options: readonly number[],
): number {
  if (value === undefined || !options.length) {
    return options[0] ?? 0;
  }
  return options.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  );
}

/** Output tab: aspect ratio, duration, output count, and (music only) style/instrumental/lyrics. */
export default function GenerationSetupOutputSection({
  capabilities,
  onResetField,
  onSetField,
  reasons,
  setup,
}: GenerationSetupOutputSectionProps) {
  const translate = useTranslations('agent.generationSetup');
  const isMusic = setup.values.type === 'music';
  const musicDurationState = isMusic
    ? resolveMusicDurationState(setup.values.modelKey)
    : null;
  const durationOptions = musicDurationState
    ? musicDurationState.options
    : GENERATION_SETUP_DURATION_OPTIONS_SECONDS;
  const hasDurationEditing = musicDurationState
    ? musicDurationState.hasDurationEditing
    : true;
  const showDuration = capabilities.hasDuration && hasDurationEditing;

  // A model switch can leave `duration` outside the newly-resolved model's
  // own range (e.g. 90s carried over from Eleven Music onto MusicGen, whose
  // max is 30s) — snap it into range immediately instead of letting a
  // provider silently clamp a value the UI still shows as selected.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-check when the resolved option grid, the current value, or duration's own availability changes; `onSetField` is a stable callback from the parent, not state this effect reacts to.
  useEffect(() => {
    if (
      !showDuration ||
      setup.values.duration === undefined ||
      durationOptions.includes(setup.values.duration)
    ) {
      return;
    }
    onSetField(
      'duration',
      snapToNearestOption(setup.values.duration, durationOptions),
    );
  }, [durationOptions, setup.values.duration, showDuration]);

  return (
    <div className="flex flex-col gap-3">
      {capabilities.hasAspectRatio ? (
        <GenerationSetupFieldRow
          fieldKey="aspectRatio"
          label="Aspect ratio"
          onReset={onResetField}
          reason={reasons.aspectRatio}
          source={setup.sources.aspectRatio ?? 'agent'}
        >
          <Select
            onValueChange={(value) => onSetField('aspectRatio', value)}
            value={setup.values.aspectRatio}
          >
            <SelectTrigger
              aria-label="Aspect ratio"
              className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
            >
              <SelectValue placeholder="Aspect ratio" />
            </SelectTrigger>
            <SelectContent>
              {GENERATION_SETUP_ASPECT_RATIO_OPTIONS.map((ratio) => (
                <SelectItem key={ratio} value={ratio}>
                  {ratio}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GenerationSetupFieldRow>
      ) : null}

      {showDuration ? (
        <GenerationSetupFieldRow
          fieldKey="duration"
          label="Duration"
          onReset={onResetField}
          reason={reasons.duration}
          source={setup.sources.duration ?? 'agent'}
        >
          <Select
            onValueChange={(value) => onSetField('duration', Number(value))}
            value={String(setup.values.duration ?? '')}
          >
            <SelectTrigger
              aria-label="Duration"
              className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
            >
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              {durationOptions.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {translate('durationSeconds', { seconds })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GenerationSetupFieldRow>
      ) : null}

      {capabilities.hasStyle ? (
        <GenerationSetupFieldRow
          fieldKey="style"
          label={translate('style')}
          onReset={onResetField}
          reason={reasons.style}
          source={setup.sources.style ?? 'agent'}
        >
          <Input
            aria-label={translate('style')}
            className={SHELL_CONTROL_HEIGHT_CLASS}
            onChange={(event) => onSetField('style', event.target.value)}
            placeholder={translate('stylePlaceholder')}
            value={setup.values.style ?? ''}
          />
        </GenerationSetupFieldRow>
      ) : null}

      {capabilities.hasInstrumentalToggle ? (
        <GenerationSetupFieldRow
          fieldKey="instrumental"
          label={translate('instrumental')}
          onReset={onResetField}
          reason={reasons.instrumental}
          source={setup.sources.instrumental ?? 'agent'}
        >
          <div className="flex w-full justify-end">
            <Switch
              aria-label={translate('instrumental')}
              isChecked={setup.values.instrumental ?? false}
              onCheckedChange={(checked) => onSetField('instrumental', checked)}
            />
          </div>
        </GenerationSetupFieldRow>
      ) : null}

      {capabilities.hasLyrics ? (
        <GenerationSetupFieldRow
          fieldKey="lyrics"
          label={translate('lyrics')}
          onReset={onResetField}
          reason={reasons.lyrics}
          source={setup.sources.lyrics ?? 'agent'}
        >
          <Textarea
            aria-label={translate('lyrics')}
            isDisabled={setup.values.instrumental === true}
            onChange={(event) => onSetField('lyrics', event.target.value)}
            placeholder={translate('lyricsPlaceholder')}
            rows={3}
            value={setup.values.lyrics ?? ''}
          />
        </GenerationSetupFieldRow>
      ) : null}

      {capabilities.hasOutputs ? (
        <GenerationSetupFieldRow
          fieldKey="outputs"
          label="Outputs"
          onReset={onResetField}
          reason={reasons.outputs}
          source={setup.sources.outputs ?? 'agent'}
        >
          <Select
            onValueChange={(value) => onSetField('outputs', Number(value))}
            value={String(setup.values.outputs)}
          >
            <SelectTrigger
              aria-label="Outputs"
              className={cn('w-full', SHELL_CONTROL_HEIGHT_CLASS)}
            >
              <SelectValue placeholder="Outputs" />
            </SelectTrigger>
            <SelectContent>
              {GENERATION_SETUP_OUTPUTS_OPTIONS.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {count}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GenerationSetupFieldRow>
      ) : null}
    </div>
  );
}
