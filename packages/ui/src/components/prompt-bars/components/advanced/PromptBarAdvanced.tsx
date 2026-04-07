'use client';

import { DropdownDirection, TagCategory } from '@genfeedai/enums';
import type { ISound } from '@genfeedai/interfaces';
import type { PromptBarAdvancedProps } from '@props/prompt-bars/prompt-bar-tiers.props';
import DropdownMultiSelect from '@ui/dropdowns/multiselect/DropdownMultiSelect';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import PromptBarMetadataSelectors from '@ui/prompt-bars/components/metadata-selectors/PromptBarMetadataSelectors';
import DropdownTags from '@ui/tags/dropdown/DropdownTags';
import { memo } from 'react';
import { HiMusicalNote, HiNoSymbol } from 'react-icons/hi2';

const PromptBarAdvanced = memo(function PromptBarAdvanced({
  currentConfig,
  form,
  isDisabledState,
  controlClass,
  isAdvancedControlsEnabled,
  profiles,
  filteredPresets,
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
  selectedPreset,
  setSelectedPreset,
  selectedProfile,
  setSelectedProfile,
  refocusTextarea,
  onTextChange,
  triggerConfigChange,
  isOpen,
  onClose,
}: PromptBarAdvancedProps) {
  if (!isAdvancedControlsEnabled) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Advanced Settings</SheetTitle>
          <SheetDescription>
            Fine-tune your generation with metadata, styles, and filters.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-6">
          <PromptBarMetadataSelectors
            currentConfig={currentConfig}
            filteredPresets={filteredPresets}
            profiles={profiles ?? []}
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
            onTextChange={onTextChange}
            triggerConfigChange={triggerConfigChange}
            onModelSelect={(modelKey) => {
              form.setValue('models', [modelKey], {
                shouldValidate: true,
              });
            }}
          />

          {currentConfig.buttons?.tags && (
            <DropdownTags
              direction={DropdownDirection.DOWN}
              isDisabled={isDisabledState}
              className={controlClass}
              scope={TagCategory.INGREDIENT}
              selectedTags={
                (form.getValues('tags') ?? []).filter(Boolean) as string[]
              }
              onChange={(tagIds) => {
                form.setValue('tags', tagIds, {
                  shouldValidate: true,
                });
              }}
            />
          )}

          {filteredSounds.length > 0 && (
            <DropdownMultiSelect
              name="sounds"
              icon={<HiMusicalNote className="w-4 h-4" />}
              placeholder="Sounds"
              className={controlClass}
              direction={DropdownDirection.DOWN}
              isDisabled={isDisabledState}
              values={
                (form.getValues('sounds') ?? []).filter(Boolean) as string[]
              }
              options={filteredSounds
                .filter(
                  (sound): sound is ISound & { key: string; label: string } =>
                    Boolean(sound.key && sound.label),
                )
                .map((sound) => ({ label: sound.label, value: sound.key }))}
              onChange={(_name, values) => {
                form.setValue('sounds', values, {
                  shouldValidate: true,
                });
              }}
            />
          )}

          {filteredBlacklists.length > 0 && (
            <DropdownMultiSelect
              name="blacklist"
              icon={<HiNoSymbol className="w-4 h-4" />}
              placeholder="Blacklist"
              className={controlClass}
              direction={DropdownDirection.DOWN}
              isDisabled={isDisabledState}
              values={
                (form.getValues('blacklist') ?? []).filter(Boolean) as string[]
              }
              options={filteredBlacklists.map((blacklist) => ({
                label: blacklist.label,
                value: blacklist.key,
              }))}
              onChange={(_name, values) => {
                form.setValue('blacklist', values, {
                  shouldValidate: true,
                });
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});

export default PromptBarAdvanced;
