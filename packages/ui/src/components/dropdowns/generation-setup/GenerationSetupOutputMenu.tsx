'use client';

import { resolveMusicSettings } from '@genfeedai/contracts/constants';
import { resolveModelDurationOptions } from '@genfeedai/helpers/generation-controls.helper';
import type { GenerationSetupOutputMenuProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupAspectRatioIcon from '@ui/dropdowns/generation-setup/GenerationSetupAspectRatioIcon';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import GenerationSetupMenuField from '@ui/dropdowns/generation-setup/GenerationSetupMenuField';
import GenerationSetupSubmenuList from '@ui/dropdowns/generation-setup/GenerationSetupSubmenuList';
import {
  GENERATION_SETUP_ASPECT_RATIO_OPTIONS,
  GENERATION_SETUP_DURATION_OPTIONS_SECONDS,
  GENERATION_SETUP_OUTPUTS_OPTIONS,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { Clock3, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';

const AUTO_ASPECT_RATIO = 'auto';
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
 * Output as one menu: aspect ratio, duration and outputs open as nested lists.
 * Fields that are not a pick from a list (music style, instrumental, lyrics,
 * model controls) sit below them in the same menu.
 */
export default function GenerationSetupOutputMenu({
  capabilities,
  controls,
  inputControls,
  models = [],
  onResetField,
  onSetField,
  referenceCount = 0,
  setup,
}: GenerationSetupOutputMenuProps) {
  const translate = useTranslations('agent.generationSetup');
  const isMusic = setup.values.type === 'music';
  const musicDurationState = isMusic
    ? resolveMusicSettings(setup.values.modelKey)
    : null;
  // A video model offers the clip lengths its provider runs at the chosen
  // resolution; the shared list only covers a model that declares none.
  const selectedModel = models.find(
    (model) => model.key === setup.values.modelKey,
  );
  const modelDurations =
    !isMusic && selectedModel
      ? resolveModelDurationOptions(selectedModel, setup.values.resolution)
      : [];
  const durationOptions = musicDurationState
    ? musicDurationState.durations
    : modelDurations.length > 0
      ? modelDurations
      : GENERATION_SETUP_DURATION_OPTIONS_SECONDS;
  const hasDurationEditing = musicDurationState
    ? musicDurationState.hasDurationEditing
    : true;
  const showDuration =
    inputControls?.mediaKind !== 'video' &&
    capabilities.hasDuration &&
    hasDurationEditing;
  const showAspectRatio =
    capabilities.hasAspectRatio && inputControls?.mediaKind !== 'video';
  const hasInstrumental = musicDurationState
    ? musicDurationState.hasInstrumentalToggle &&
      capabilities.hasInstrumentalToggle
    : capabilities.hasInstrumentalToggle;
  const hasLyrics = musicDurationState
    ? musicDurationState.hasLyrics && capabilities.hasLyrics
    : capabilities.hasLyrics;
  const hasExtraFields =
    capabilities.hasStyle || hasInstrumental || hasLyrics || Boolean(controls);

  const modelRatios = inputControls?.fields.aspect_ratio?.enum?.filter(
    (value): value is string =>
      typeof value === 'string' &&
      (value !== AUTO_ASPECT_RATIO ||
        referenceCount > 0 ||
        !inputControls.isAutoAspectReferenceRequired),
  );
  const ratios = modelRatios ?? GENERATION_SETUP_ASPECT_RATIO_OPTIONS;
  const isRatioOwnedByAgent =
    (setup.sources.aspectRatio ?? 'agent') === 'agent';
  const currentRatio = setup.values.aspectRatio;
  const isAutoRatio = currentRatio === AUTO_ASPECT_RATIO;
  // Models without an `auto` value hand the choice back to the agent instead.
  const hasAutoValue = ratios.includes(AUTO_ASPECT_RATIO);
  const ratioValues = ratios.filter((ratio) => ratio !== AUTO_ASPECT_RATIO);
  const ratioOptions = [
    {
      icon: <GenerationSetupAspectRatioIcon ratio={AUTO_ASPECT_RATIO} />,
      label: translate('auto'),
      value: AUTO_ASPECT_RATIO,
    },
    ...ratioValues.map((ratio) => ({
      icon: <GenerationSetupAspectRatioIcon ratio={ratio} />,
      label: ratio,
      value: ratio,
    })),
  ];
  const selectedRatioValue =
    isAutoRatio || (isRatioOwnedByAgent && !hasAutoValue)
      ? AUTO_ASPECT_RATIO
      : currentRatio;

  return (
    <>
      {showAspectRatio ? (
        <GenerationSetupMenuField
          icon={<GenerationSetupAspectRatioIcon ratio={currentRatio} />}
          label={translate('aspectRatio')}
          value={isAutoRatio ? translate('auto') : currentRatio}
        >
          <GenerationSetupSubmenuList
            label={translate('aspectRatio')}
            onValueChange={(value) => {
              if (value === AUTO_ASPECT_RATIO && !hasAutoValue)
                onResetField('aspectRatio');
              else onSetField('aspectRatio', value);
            }}
            options={ratioOptions}
            value={selectedRatioValue}
          />
        </GenerationSetupMenuField>
      ) : null}

      {showDuration ? (
        <GenerationSetupMenuField
          icon={<Clock3 aria-hidden="true" className="size-3.5 shrink-0" />}
          label={translate('duration')}
          value={
            setup.values.duration
              ? translate('durationSeconds', { seconds: setup.values.duration })
              : ''
          }
        >
          <GenerationSetupSubmenuList
            label={translate('duration')}
            onReset={
              (setup.sources.duration ?? 'agent') === 'agent'
                ? undefined
                : () => onResetField('duration')
            }
            onValueChange={(value) => onSetField('duration', Number(value))}
            options={durationOptions.map((seconds) => ({
              label: translate('durationSeconds', { seconds }),
              value: String(seconds),
            }))}
            value={String(setup.values.duration ?? '')}
          />
        </GenerationSetupMenuField>
      ) : null}

      {capabilities.hasOutputs ? (
        <GenerationSetupMenuField
          icon={<Copy aria-hidden="true" className="size-3.5 shrink-0" />}
          label={translate('outputs')}
          value={`x${setup.values.outputs}`}
        >
          <GenerationSetupSubmenuList
            label={translate('outputs')}
            onReset={
              (setup.sources.outputs ?? 'agent') === 'agent'
                ? undefined
                : () => onResetField('outputs')
            }
            onValueChange={(value) => onSetField('outputs', Number(value))}
            options={GENERATION_SETUP_OUTPUTS_OPTIONS.filter(
              (count) => !inputControls || count <= inputControls.maxOutputs,
            ).map((count) => ({ label: String(count), value: String(count) }))}
            value={String(setup.values.outputs)}
          />
        </GenerationSetupMenuField>
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
