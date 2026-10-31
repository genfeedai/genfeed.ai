'use client';

import { hasSourceDerivedAspect } from '@genfeedai/contracts/constants';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import GenerationSetupFieldRow from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupFieldRow';
import GenerationSetupRatioGrid from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupRatioGrid';
import GenerationSetupStepSlider from '@/features/studio/components/dropdowns/generation-setup/GenerationSetupStepSlider';
import { GENERATION_SETUP_OUTPUTS_OPTIONS } from '@/features/studio/components/dropdowns/generation-setup/generation-setup.constants';
import {
  GENERATION_SETUP_AUTO_ASPECT_RATIO,
  resolveGenerationSetupOutputFields,
} from '@/features/studio/components/dropdowns/generation-setup/generation-setup.output-fields';
import type { GenerationSetupOutputMenuProps } from '@/features/studio/props/generation-setup.props';

const EDITING_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  'Delete',
  'End',
  'Home',
]);

/** Typing in the extra fields must not reach the menu's typeahead. */
function keepTypingInField(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key.length === 1 || EDITING_KEYS.has(event.key))
    event.stopPropagation();
}

/**
 * One part of the Output setup, as the body of its chip's menu. Aspect ratio
 * opens as a grid of ratio tiles and Duration as a step slider. What is left
 * (outputs as a step slider, plus music style, instrumental, lyrics and model
 * controls) shares the Output chip's menu, with no nested list.
 */
export default function GenerationSetupOutputMenu({
  capabilities,
  controls,
  inputControls,
  models = [],
  onResetField,
  onSetField,
  referenceCount = 0,
  section,
  setup,
}: GenerationSetupOutputMenuProps) {
  const translate = useTranslations('agent.generationSetup');
  const fields = resolveGenerationSetupOutputFields({
    capabilities,
    controls,
    inputControls,
    models,
    referenceCount,
    setup,
  });

  if (section === 'aspectRatio') {
    const currentRatio = setup.values.aspectRatio;
    const isRatioOwnedByAgent =
      (setup.sources.aspectRatio ?? 'agent') === 'agent';
    // The checked row is the value the chip shows. Auto is checked only when
    // the ratio really is auto, or when the agent's value is not one this
    // model offers (Auto then stands for "whatever the agent picks").
    const isRatioListed = fields.ratios.includes(currentRatio);
    const selectedRatioValue =
      currentRatio === GENERATION_SETUP_AUTO_ASPECT_RATIO ||
      (isRatioOwnedByAgent && !fields.hasAutoRatio && !isRatioListed)
        ? GENERATION_SETUP_AUTO_ASPECT_RATIO
        : currentRatio;

    return (
      <GenerationSetupRatioGrid
        label={translate('aspectRatio')}
        note={
          hasSourceDerivedAspect(setup.values.modelKey)
            ? translate('aspectFollowsSource')
            : undefined
        }
        onValueChange={(value) => {
          if (
            value === GENERATION_SETUP_AUTO_ASPECT_RATIO &&
            !fields.hasAutoRatio
          )
            onResetField('aspectRatio');
          else onSetField('aspectRatio', value);
        }}
        options={[
          {
            label: translate('auto'),
            ratio: GENERATION_SETUP_AUTO_ASPECT_RATIO,
            value: GENERATION_SETUP_AUTO_ASPECT_RATIO,
          },
          ...fields.ratios.map((ratio) => ({
            label: ratio,
            ratio,
            value: ratio,
          })),
        ]}
        value={selectedRatioValue}
      />
    );
  }

  if (section === 'duration') {
    return (
      <GenerationSetupStepSlider
        fieldKey="duration"
        label={translate('duration')}
        onReset={onResetField}
        onValueChange={(seconds) => onSetField('duration', seconds)}
        source={setup.sources.duration ?? 'agent'}
        steps={fields.durationOptions.map((seconds) => ({
          label: translate('durationSeconds', { seconds }),
          value: seconds,
        }))}
        value={setup.values.duration ?? fields.durationOptions[0] ?? 0}
      />
    );
  }

  const { hasExtraFields, hasInstrumental, hasLyrics } = fields;

  return (
    <>
      {capabilities.hasOutputs ? (
        <GenerationSetupStepSlider
          fieldKey="outputs"
          label={translate('outputs')}
          onReset={onResetField}
          onValueChange={(count) => onSetField('outputs', count)}
          source={setup.sources.outputs ?? 'agent'}
          steps={GENERATION_SETUP_OUTPUTS_OPTIONS.filter(
            (count) => !inputControls || count <= inputControls.maxOutputs,
          ).map((count) => ({ label: `x${count}`, value: count }))}
          value={setup.values.outputs}
        />
      ) : null}

      {hasExtraFields ? (
        <div
          className="flex flex-col gap-3 border-t border-border p-3 first:border-t-0"
          onKeyDown={keepTypingInField}
        >
          {capabilities.hasStyle ? (
            <GenerationSetupFieldRow
              fieldKey="style"
              label={translate('style')}
              onReset={onResetField}
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

          {hasInstrumental ? (
            <GenerationSetupFieldRow
              fieldKey="instrumental"
              label={translate('instrumental')}
              onReset={onResetField}
              source={setup.sources.instrumental ?? 'agent'}
            >
              <div className="flex w-full justify-end">
                <Switch
                  aria-label={translate('instrumental')}
                  isChecked={setup.values.instrumental ?? false}
                  onCheckedChange={(checked) =>
                    onSetField('instrumental', checked)
                  }
                />
              </div>
            </GenerationSetupFieldRow>
          ) : null}

          {hasLyrics ? (
            <GenerationSetupFieldRow
              fieldKey="lyrics"
              label={translate('lyrics')}
              onReset={onResetField}
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

          {controls ? (
            <div className="flex flex-col gap-2">{controls}</div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
