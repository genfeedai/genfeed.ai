'use client';

import { ModelCategory, Platform } from '@genfeedai/enums';
import type {
  IElementCamera,
  IElementCameraMovement,
  IElementLens,
  IElementLighting,
  IElementMood,
  IElementScene,
  IElementStyle,
  IFontFamily,
  IPreset,
} from '@genfeedai/interfaces';
import type { PromptBarMetadataSelectorsProps } from '@genfeedai/props/prompt-bars/prompt-bar-metadata-selectors.props';
import FormDropdown from '@ui/primitives/dropdown-field';
import type { ChangeEvent } from 'react';
import { memo } from 'react';
import {
  HiArrowsRightLeft,
  HiBookmark,
  HiCamera,
  HiFaceSmile,
  HiGlobeAlt,
  HiLanguage,
  HiLightBulb,
  HiSwatch,
  HiUserCircle,
  HiViewfinderCircle,
} from 'react-icons/hi2';

const presetTabs = [
  { id: 'all', label: 'All' },
  { id: 'generate-assets', label: 'Assets' },
  { id: 'socials', label: 'Socials' },
];

const SOCIAL_PLATFORMS = [
  Platform.YOUTUBE,
  Platform.TWITTER,
  Platform.INSTAGRAM,
  Platform.TIKTOK,
  Platform.LINKEDIN,
];

const ASSET_CATEGORIES = [
  ModelCategory.IMAGE,
  ModelCategory.VIDEO,
  ModelCategory.MUSIC,
];

function getPresetGroup(preset: IPreset): string {
  if (preset.platform && SOCIAL_PLATFORMS.includes(preset.platform)) {
    return 'socials';
  }

  if (ASSET_CATEGORIES.includes(preset.category) && !preset.platform) {
    return 'generate-assets';
  }

  return 'other';
}

const PromptBarMetadataSelectors = memo(function PromptBarMetadataSelectors({
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
  form,
  selectedPreset,
  setSelectedPreset,
  selectedProfile,
  setSelectedProfile,
  refocusTextarea,
  isDisabledState,
  controlClass,
  triggerDisplay = 'default',
  onTextChange,
  triggerConfigChange,
  onModelSelect,
}: PromptBarMetadataSelectorsProps) {
  return (
    <>
      {currentConfig.buttons?.presets && filteredPresets?.length > 0 && (
        <FormDropdown
          key="preset"
          name="preset"
          icon={<HiBookmark />}
          label="Preset"
          triggerDisplay={triggerDisplay}
          value={selectedPreset}
          isSearchEnabled={true}
          isFullWidth={false}
          dropdownDirection="up"
          className={controlClass}
          isDisabled={isDisabledState}
          tabs={presetTabs}
          options={filteredPresets.map((preset: IPreset) => ({
            description: preset.description,
            group: getPresetGroup(preset),
            key: preset.key,
            label: preset.label,
            thumbnailUrl: preset.thumbnailUrl,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const value = e.target.value;
            const preset = filteredPresets?.find((p) => p.key === value);

            if (preset) {
              setSelectedPreset(preset.key);

              const textToInject = preset.prompt || preset.description;
              form.setValue('text', textToInject, {
                shouldValidate: true,
              });
              form.setValue('prompt_template', preset.key, {
                shouldValidate: true,
              });

              onTextChange?.(textToInject);

              if (preset.model && onModelSelect) {
                onModelSelect(preset.model);
              }

              if (preset.style) {
                form.setValue('style', preset.style, { shouldValidate: true });
              }

              if (preset.camera) {
                form.setValue('camera', preset.camera, {
                  shouldValidate: true,
                });
              }

              if (preset.scene) {
                form.setValue('scene', preset.scene, { shouldValidate: true });
              }

              if (preset.mood) {
                form.setValue('mood', preset.mood, { shouldValidate: true });
              }

              const presetBlacklist =
                preset.blacklists || (preset as any).blacklist;
              if (presetBlacklist?.length) {
                const blacklist = [...presetBlacklist].filter(
                  (key): key is string => key !== undefined,
                );

                form.setValue('blacklist', blacklist, {
                  shouldValidate: true,
                });
              }

              triggerConfigChange?.();

              refocusTextarea();
            } else {
              setSelectedPreset('');
              form.setValue('prompt_template', undefined, {
                shouldValidate: true,
              });
            }
          }}
        />
      )}

      {profiles?.length > 0 && (
        <FormDropdown
          key="profile"
          name="profile"
          icon={<HiUserCircle />}
          label="Brand Voice"
          triggerDisplay={triggerDisplay}
          value={selectedProfile}
          isSearchEnabled={true}
          isFullWidth={false}
          dropdownDirection="up"
          className={controlClass}
          isDisabled={isDisabledState}
          options={profiles.map((profile) => ({
            key: profile.id,
            label: profile.name,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const value = e.target.value;
            setSelectedProfile(value);
          }}
        />
      )}

      {currentConfig.buttons?.scene && filteredScenes.length > 0 && (
        <FormDropdown
          key="scene"
          name="scene"
          icon={<HiGlobeAlt />}
          label="Scene"
          triggerDisplay={triggerDisplay}
          value={form.watch('scene')}
          isSearchEnabled={true}
          isDisabled={isDisabledState}
          isFullWidth={false}
          isNoneEnabled={true}
          dropdownDirection="up"
          className={controlClass}
          options={filteredScenes.map((scene: IElementScene) => ({
            description: scene.description,
            key: scene.key,
            label: scene.label,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('scene', e.target.value, { shouldValidate: true });
          }}
        />
      )}

      {currentConfig.buttons?.fontFamily &&
        filteredFontFamilies?.length > 0 && (
          <FormDropdown
            key="fontFamily"
            name="fontFamily"
            icon={<HiLanguage />}
            label="Font"
            triggerDisplay={triggerDisplay}
            value={form.getValues('fontFamily')}
            isDisabled={isDisabledState}
            isNoneEnabled={true}
            isFullWidth={false}
            dropdownDirection="up"
            className={controlClass}
            options={filteredFontFamilies.map((fontFamily: IFontFamily) => ({
              key: fontFamily.key,
              label: fontFamily.label,
            }))}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              form.setValue('fontFamily', e.target.value, {
                shouldValidate: true,
              });
            }}
          />
        )}

      {currentConfig.buttons?.style && filteredStyles.length > 0 && (
        <FormDropdown
          key="style"
          name="style"
          icon={<HiSwatch />}
          label="Style"
          triggerDisplay={triggerDisplay}
          value={form.watch('style')}
          isDisabled={isDisabledState}
          isFullWidth={false}
          isNoneEnabled={true}
          isSearchEnabled={true}
          className={controlClass}
          dropdownDirection="up"
          options={filteredStyles.map((style: IElementStyle) => ({
            description: style.description,
            key: style.key,
            label: style.label,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('style', e.target.value, { shouldValidate: true });
          }}
        />
      )}

      {currentConfig.buttons?.camera && filteredCameras.length > 0 && (
        <FormDropdown
          key="camera"
          name="camera"
          icon={<HiCamera />}
          label="Camera"
          triggerDisplay={triggerDisplay}
          value={form.watch('camera')}
          isSearchEnabled={true}
          isFullWidth={false}
          isNoneEnabled={true}
          className={controlClass}
          dropdownDirection="up"
          options={filteredCameras.map((camera: IElementCamera) => ({
            description: camera.description,
            key: camera.key,
            label: camera.label,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('camera', e.target.value, { shouldValidate: true });
            refocusTextarea();
          }}
          isDisabled={isDisabledState}
        />
      )}

      {filteredLightings.length > 0 && (
        <FormDropdown
          key="lighting"
          name="lighting"
          icon={<HiLightBulb />}
          label="Lighting"
          triggerDisplay={triggerDisplay}
          value={form.watch('lighting')}
          isSearchEnabled={true}
          isFullWidth={false}
          isNoneEnabled={true}
          className={controlClass}
          dropdownDirection="up"
          options={filteredLightings.map((lighting: IElementLighting) => ({
            description: lighting.description,
            key: lighting.key,
            label: lighting.label,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('lighting', e.target.value, { shouldValidate: true });
            refocusTextarea();
          }}
          isDisabled={isDisabledState}
        />
      )}

      {filteredLenses.length > 0 && (
        <FormDropdown
          key="lens"
          name="lens"
          icon={<HiViewfinderCircle />}
          label="Lens"
          triggerDisplay={triggerDisplay}
          value={form.watch('lens')}
          isSearchEnabled={true}
          isFullWidth={false}
          isNoneEnabled={true}
          className={controlClass}
          dropdownDirection="up"
          options={filteredLenses.map((lens: IElementLens) => ({
            description: lens.description,
            key: lens.key,
            label: lens.label,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('lens', e.target.value, { shouldValidate: true });
            refocusTextarea();
          }}
          isDisabled={isDisabledState}
        />
      )}

      {filteredCameraMovements.length > 0 && (
        <FormDropdown
          key="cameraMovement"
          name="cameraMovement"
          icon={<HiArrowsRightLeft />}
          label="Movement"
          triggerDisplay={triggerDisplay}
          value={form.watch('cameraMovement')}
          isSearchEnabled={true}
          isFullWidth={false}
          isNoneEnabled={true}
          className={controlClass}
          dropdownDirection="up"
          options={filteredCameraMovements.map(
            (movement: IElementCameraMovement) => ({
              description: movement.description,
              key: movement.key,
              label: movement.label,
            }),
          )}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('cameraMovement', e.target.value, {
              shouldValidate: true,
            });
            refocusTextarea();
          }}
          isDisabled={isDisabledState}
        />
      )}

      {currentConfig.buttons?.mood && filteredMoods.length > 0 && (
        <FormDropdown
          key="mood"
          name="mood"
          icon={<HiFaceSmile />}
          label="Mood"
          triggerDisplay={triggerDisplay}
          value={form.watch('mood')}
          isSearchEnabled={true}
          isDisabled={isDisabledState}
          isFullWidth={false}
          isNoneEnabled={true}
          className={controlClass}
          dropdownDirection="up"
          options={filteredMoods.map((mood: IElementMood) => ({
            description: mood.description,
            key: mood.key,
            label: mood.label,
          }))}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            form.setValue('mood', e.target.value, { shouldValidate: true });
            refocusTextarea();
          }}
        />
      )}
    </>
  );
});

export default PromptBarMetadataSelectors;
