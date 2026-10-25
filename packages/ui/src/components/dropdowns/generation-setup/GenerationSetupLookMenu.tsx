'use client';

import type {
  GenerationSetupLookFieldKey,
  GenerationSetupLookMenuProps,
  GenerationSetupLookPreviewKind,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupMenuField from '@ui/dropdowns/generation-setup/GenerationSetupMenuField';
import GenerationSetupSubmenuList from '@ui/dropdowns/generation-setup/GenerationSetupSubmenuList';
import {
  GENERATION_SETUP_LOOK_FIELD_LABELS,
  GENERATION_SETUP_LOOK_FIELD_ORDER,
} from '@ui/dropdowns/generation-setup/generation-setup.constants';

/** Look fields that have illustrations for their platform defaults. */
const PREVIEW_KINDS: Partial<
  Record<GenerationSetupLookFieldKey, GenerationSetupLookPreviewKind>
> = {
  camera: 'camera',
  cameraMovement: 'cameraMovement',
  lens: 'lens',
  lighting: 'lighting',
  mood: 'mood',
  scene: 'scene',
  style: 'style',
};

/**
 * Look as one menu: a row per field (Style, Mood, Scene, …), each opening a
 * searchable list with an illustration of the highlighted option. Empty when
 * the surface passes no `lookOptions`, such as the agent composer.
 */
export default function GenerationSetupLookMenu({
  lookOptions,
  onResetField,
  onSetField,
  setup,
}: GenerationSetupLookMenuProps) {
  return (
    <>
      {GENERATION_SETUP_LOOK_FIELD_ORDER.map((key) => {
        const options = lookOptions[key] ?? [];
        if (options.length === 0) return null;
        const label = GENERATION_SETUP_LOOK_FIELD_LABELS[key];
        const value = setup.values[key] ?? '';
        const selected = options.find((option) => String(option.key) === value);
        const isOwnedByAgent = (setup.sources[key] ?? 'agent') === 'agent';

        return (
          <GenerationSetupMenuField
            key={key}
            label={label}
            value={selected?.label ?? value}
          >
            <GenerationSetupSubmenuList
              isMenuKeptOpen
              isSearchable
              label={label}
              onReset={isOwnedByAgent ? undefined : () => onResetField(key)}
              onValueChange={(next) => onSetField(key, next)}
              options={options.map((option) => ({
                description: option.description,
                isPlatformDefault: option.isPlatformDefault,
                label: option.label,
                thumbnailUrl: option.thumbnailUrl,
                value: String(option.key),
              }))}
              previewKind={PREVIEW_KINDS[key]}
              value={value}
            />
          </GenerationSetupMenuField>
        );
      })}
    </>
  );
}
