'use client';

import { resolveMusicSettings } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { GenerationSetupOutputSectionProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import {
  GENERATION_SETUP_ASPECT_RATIO_OPTIONS,
  GENERATION_SETUP_DURATION_OPTIONS_SECONDS,
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
    ? resolveMusicSettings(setup.values.modelKey)
    : null;
  const durationOptions = musicDurationState
    ? musicDurationState.durations
    : GENERATION_SETUP_DURATION_OPTIONS_SECONDS;
  const hasDurationEditing = musicDurationState
    ? musicDurationState.hasDurationEditing
    : true;
  const showDuration = capabilities.hasDuration && hasDurationEditing;

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

      {(
        musicDurationState
          ? musicDurationState.hasInstrumentalToggle &&
            capabilities.hasInstrumentalToggle
          : capabilities.hasInstrumentalToggle
      ) ? (
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

      {(
        musicDurationState
          ? musicDurationState.hasLyrics && capabilities.hasLyrics
          : capabilities.hasLyrics
      ) ? (
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
