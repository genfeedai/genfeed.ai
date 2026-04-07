'use client';

import { DropdownDirection, TagCategory } from '@genfeedai/enums';
import type { ISound } from '@genfeedai/interfaces';
import type { PromptBarSecondaryControlsRowProps } from '@props/prompt-bars/prompt-bar-layout.props';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import PromptBarMetadataSelectors from '@ui/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';
import DropdownTags from '@ui/tags/dropdown/DropdownTags';
import { memo } from 'react';
import { HiMusicalNote, HiNoSymbol } from 'react-icons/hi2';

function filterTruthy(
  values: (string | undefined | null)[] | undefined,
): string[] {
  return (values ?? []).filter((v): v is string => Boolean(v));
}

function hasSoundKeyAndLabel(
  sound: ISound,
): sound is ISound & { key: string; label: string } {
  return typeof sound.key === 'string' && typeof sound.label === 'string';
}

const PromptBarSecondaryControlsRow = memo(
  function PromptBarSecondaryControlsRow({
    currentConfig,
    filteredPresets,
    profiles,
    filteredScenes,
    filteredFontFamilies,
    filteredStyles,
    filteredCameras,
    filteredLightings,
    filteredLenses,
    filteredCameraMovements,
    filteredMoods,
    filteredSounds,
    filteredBlacklists,
    form,
    selectedPreset,
    setSelectedPreset,
    selectedProfile,
    setSelectedProfile,
    refocusTextarea,
    isDisabledState,
    controlClass,
  }: PromptBarSecondaryControlsRowProps) {
    const soundOptions = filteredSounds
      .filter(hasSoundKeyAndLabel)
      .map((sound) => ({
        label: sound.label,
        value: sound.key,
      }));

    const blacklistOptions = filteredBlacklists.map((blacklist) => ({
      label: blacklist.label,
      value: blacklist.key,
    }));

    return (
      <div className="flex flex-wrap items-center gap-2 overflow-visible">
        <PromptBarMetadataSelectors
          currentConfig={currentConfig}
          filteredPresets={filteredPresets}
          profiles={profiles}
          filteredScenes={filteredScenes}
          filteredFontFamilies={filteredFontFamilies}
          filteredStyles={filteredStyles}
          filteredCameras={filteredCameras}
          filteredLightings={filteredLightings}
          filteredLenses={filteredLenses}
          filteredCameraMovements={filteredCameraMovements}
          filteredMoods={filteredMoods}
          form={form}
          selectedPreset={selectedPreset}
          setSelectedPreset={setSelectedPreset}
          selectedProfile={selectedProfile}
          setSelectedProfile={setSelectedProfile}
          refocusTextarea={refocusTextarea}
          isDisabledState={isDisabledState}
          controlClass={controlClass}
        />

        {currentConfig.buttons?.tags && (
          <DropdownTags
            direction={DropdownDirection.UP}
            isDisabled={isDisabledState}
            className={controlClass}
            scope={TagCategory.INGREDIENT}
            selectedTags={filterTruthy(form.getValues('tags'))}
            onChange={(tagIds) =>
              form.setValue('tags', tagIds, { shouldValidate: true })
            }
          />
        )}

        {filteredSounds.length > 0 && (
          <DropdownMultiSelect
            name="sounds"
            icon={<HiMusicalNote className="w-4 h-4" />}
            placeholder="Sounds"
            className={controlClass}
            direction={DropdownDirection.UP}
            isDisabled={isDisabledState}
            values={filterTruthy(form.getValues('sounds'))}
            options={soundOptions}
            onChange={(_, values) =>
              form.setValue('sounds', values, { shouldValidate: true })
            }
          />
        )}

        {filteredBlacklists.length > 0 && (
          <DropdownMultiSelect
            name="blacklist"
            icon={<HiNoSymbol className="w-4 h-4" />}
            placeholder="Blacklist"
            className={controlClass}
            direction={DropdownDirection.UP}
            isDisabled={isDisabledState}
            values={filterTruthy(form.getValues('blacklist'))}
            options={blacklistOptions}
            onChange={(_, values) =>
              form.setValue('blacklist', values, { shouldValidate: true })
            }
          />
        )}
      </div>
    );
  },
);

export default PromptBarSecondaryControlsRow;
