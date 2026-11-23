'use client';

import { ModelCategory, Platform } from '@genfeedai/contracts';
import type { IPreset } from '@genfeedai/contracts/interfaces';
import { Avatar } from '@ui/primitives/avatar';
import {
  OptionSelect,
  type OptionSelectOption,
} from '@ui/primitives/option-select';
import {
  ArrowLeftRight,
  Bookmark,
  Camera,
  CircleUser,
  Globe,
  Languages,
  Lightbulb,
  Palette,
  Scan,
  Smile,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';
import type { PromptBarMetadataSelectorsProps } from '@/props/prompt-bars/prompt-bar-metadata-selectors.props';

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

type PresetWithLegacyBlacklist = IPreset & {
  blacklist?: Array<string | undefined>;
};

function getPresetGroup(preset: IPreset): keyof typeof PRESET_GROUP_LABELS {
  if (preset.platform && SOCIAL_PLATFORMS.includes(preset.platform)) {
    return 'socials';
  }

  if (ASSET_CATEGORIES.includes(preset.category) && !preset.platform) {
    return 'generate-assets';
  }

  return 'other';
}

const PRESET_GROUP_LABELS = {
  'generate-assets': 'presetGroupAssets',
  other: 'presetGroupOther',
  socials: 'presetGroupSocials',
} as const;

interface ElementChoice {
  key: string;
  label: string;
}

/** Element lists (scene, style, camera, ...) are optional: the first row clears the choice. */
function withNone(
  choices: readonly ElementChoice[],
  noneLabel: string,
): OptionSelectOption[] {
  return [
    { label: noneLabel, value: '' },
    ...choices.map((choice) => ({
      isLiteral: true,
      label: choice.label,
      value: choice.key,
    })),
  ];
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
  const translate = useTranslations('ui.promptBarControls');

  const handlePresetChange = (value: string) => {
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
        preset.blacklists || (preset as PresetWithLegacyBlacklist).blacklist;
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
  };

  return (
    <>
      {currentConfig.buttons?.presets && filteredPresets?.length > 0 && (
        <OptionSelect
          key="preset"
          ariaLabel={translate('preset')}
          className={controlClass}
          icon={<Bookmark className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={handlePresetChange}
          options={filteredPresets.map((preset: IPreset) => ({
            group: translate(PRESET_GROUP_LABELS[getPresetGroup(preset)]),
            icon: preset.thumbnailUrl ? (
              <Avatar
                name={preset.label}
                shape="square"
                size="xs"
                src={preset.thumbnailUrl}
              />
            ) : undefined,
            isLiteral: true,
            label: preset.label,
            value: preset.key,
          }))}
          placeholder={translate('preset')}
          value={selectedPreset}
        />
      )}

      {profiles?.length > 0 && (
        <OptionSelect
          key="profile"
          ariaLabel={translate('brandVoice')}
          className={controlClass}
          icon={<CircleUser className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={setSelectedProfile}
          options={profiles.map((profile) => ({
            isLiteral: true,
            label: profile.name,
            value: profile.id,
          }))}
          placeholder={translate('brandVoice')}
          value={selectedProfile}
        />
      )}

      {currentConfig.buttons?.scene && filteredScenes.length > 0 && (
        <OptionSelect
          key="scene"
          ariaLabel={translate('scene')}
          className={controlClass}
          icon={<Globe className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('scene', next, { shouldValidate: true });
          }}
          options={withNone(filteredScenes, translate('none'))}
          placeholder={translate('scene')}
          value={form.watch('scene') ?? ''}
        />
      )}

      {currentConfig.buttons?.fontFamily &&
        filteredFontFamilies?.length > 0 && (
          <OptionSelect
            key="fontFamily"
            ariaLabel={translate('font')}
            className={controlClass}
            icon={<Languages className="size-4" />}
            isDisabled={isDisabledState}
            isIconOnly={triggerDisplay === 'icon-only'}
            isSearchable
            onValueChange={(next) => {
              form.setValue('fontFamily', next, { shouldValidate: true });
            }}
            options={withNone(filteredFontFamilies, translate('none'))}
            placeholder={translate('font')}
            value={form.watch('fontFamily') ?? ''}
          />
        )}

      {currentConfig.buttons?.style && filteredStyles.length > 0 && (
        <OptionSelect
          key="style"
          ariaLabel={translate('style')}
          className={controlClass}
          icon={<Palette className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('style', next, { shouldValidate: true });
          }}
          options={withNone(filteredStyles, translate('none'))}
          placeholder={translate('style')}
          value={form.watch('style') ?? ''}
        />
      )}

      {currentConfig.buttons?.camera && filteredCameras.length > 0 && (
        <OptionSelect
          key="camera"
          ariaLabel={translate('camera')}
          className={controlClass}
          icon={<Camera className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('camera', next, { shouldValidate: true });
            refocusTextarea();
          }}
          options={withNone(filteredCameras, translate('none'))}
          placeholder={translate('camera')}
          value={form.watch('camera') ?? ''}
        />
      )}

      {filteredLightings.length > 0 && (
        <OptionSelect
          key="lighting"
          ariaLabel={translate('lighting')}
          className={controlClass}
          icon={<Lightbulb className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('lighting', next, { shouldValidate: true });
            refocusTextarea();
          }}
          options={withNone(filteredLightings, translate('none'))}
          placeholder={translate('lighting')}
          value={form.watch('lighting') ?? ''}
        />
      )}

      {filteredLenses.length > 0 && (
        <OptionSelect
          key="lens"
          ariaLabel={translate('lens')}
          className={controlClass}
          icon={<Scan className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('lens', next, { shouldValidate: true });
            refocusTextarea();
          }}
          options={withNone(filteredLenses, translate('none'))}
          placeholder={translate('lens')}
          value={form.watch('lens') ?? ''}
        />
      )}

      {filteredCameraMovements.length > 0 && (
        <OptionSelect
          key="cameraMovement"
          ariaLabel={translate('movement')}
          className={controlClass}
          icon={<ArrowLeftRight className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('cameraMovement', next, { shouldValidate: true });
            refocusTextarea();
          }}
          options={withNone(filteredCameraMovements, translate('none'))}
          placeholder={translate('movement')}
          value={form.watch('cameraMovement') ?? ''}
        />
      )}

      {currentConfig.buttons?.mood && filteredMoods.length > 0 && (
        <OptionSelect
          key="mood"
          ariaLabel={translate('mood')}
          className={controlClass}
          icon={<Smile className="size-4" />}
          isDisabled={isDisabledState}
          isIconOnly={triggerDisplay === 'icon-only'}
          isSearchable
          onValueChange={(next) => {
            form.setValue('mood', next, { shouldValidate: true });
            refocusTextarea();
          }}
          options={withNone(filteredMoods, translate('none'))}
          placeholder={translate('mood')}
          value={form.watch('mood') ?? ''}
        />
      )}
    </>
  );
});

export default PromptBarMetadataSelectors;
