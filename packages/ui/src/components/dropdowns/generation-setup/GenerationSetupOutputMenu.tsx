'use client';

import { hasSourceDerivedAspect } from '@genfeedai/contracts/constants';
import type { GenerationSetupOutputMenuProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import GenerationSetupAspectRatioIcon from '@ui/dropdowns/generation-setup/GenerationSetupAspectRatioIcon';
import GenerationSetupFieldRow from '@ui/dropdowns/generation-setup/GenerationSetupFieldRow';
import GenerationSetupMenuField from '@ui/dropdowns/generation-setup/GenerationSetupMenuField';
import GenerationSetupSubmenuList from '@ui/dropdowns/generation-setup/GenerationSetupSubmenuList';
import { GENERATION_SETUP_OUTPUTS_OPTIONS } from '@ui/dropdowns/generation-setup/generation-setup.constants';
import {
  GENERATION_SETUP_AUTO_ASPECT_RATIO,
  resolveGenerationSetupOutputFields,
} from '@ui/dropdowns/generation-setup/generation-setup.output-fields';
import { Input } from '@ui/primitives/input';
import { Switch } from '@ui/primitives/switch';
import { Textarea } from '@ui/primitives/textarea';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';

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
 * and Duration each get their own chip and open as a plain list. What is left
 * (outputs, plus music style, instrumental, lyrics and model controls that are
 * not a pick from a list) shares the Output chip's menu: outputs opens as a
 * nested list, the other fields sit below it.
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
    const selectedRatioValue =
      currentRatio === GENERATION_SETUP_AUTO_ASPECT_RATIO ||
      (isRatioOwnedByAgent && !fields.hasAutoRatio)
        ? GENERATION_SETUP_AUTO_ASPECT_RATIO
        : currentRatio;

    return (
      <GenerationSetupSubmenuList
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
            icon: (
              <GenerationSetupAspectRatioIcon
                ratio={GENERATION_SETUP_AUTO_ASPECT_RATIO}
              />
            ),
            label: translate('auto'),
            value: GENERATION_SETUP_AUTO_ASPECT_RATIO,
          },
          ...fields.ratios.map((ratio) => ({
            icon: <GenerationSetupAspectRatioIcon ratio={ratio} />,
            label: ratio,
            value: ratio,
          })),
        ]}
        value={selectedRatioValue}
      />
    );
  }

  if (section === 'duration') {
    return (
      <GenerationSetupSubmenuList
        label={translate('duration')}
        onReset={
          (setup.sources.duration ?? 'agent') === 'agent'
            ? undefined
            : () => onResetField('duration')
        }
        onValueChange={(value) => onSetField('duration', Number(value))}
        options={fields.durationOptions.map((seconds) => ({
          label: translate('durationSeconds', { seconds }),
          value: String(seconds),
        }))}
        value={String(setup.values.duration ?? '')}
      />
    );
  }

  const { hasExtraFields, hasInstrumental, hasLyrics } = fields;

  return (
    <>
      {capabilities.hasOutputs ? (
        <GenerationSetupMenuField
          icon={<Copy aria-hidden="true" className="size-3.5 shrink-0" />}
          label={translate('outputs')}
          value={`x${setup.values.outputs}`}
        >
          <GenerationSetupSubmenuList
            isMenuKeptOpen
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
