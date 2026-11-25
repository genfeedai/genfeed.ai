'use client';

import { PostCategory } from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import { Label } from '@ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { useTranslations } from 'next-intl';
import ModalPostPlatformInstagramMusic from './ModalPostPlatformInstagramMusic';

type Props = {
  config: IPostPlatformConfig;
  isEnabled: boolean;
  isLoading: boolean;
  updatePlatformConfig: (
    credentialId: string,
    updates: Partial<IPostPlatformConfig>,
  ) => void;
};

export default function ModalPostPlatformInstagram({
  config,
  isEnabled,
  isLoading,
  updatePlatformConfig,
}: Props) {
  const translate = useTranslations('ui.instagramPostType');
  const radioValue = config.isStory
    ? 'story'
    : config.category === PostCategory.IMAGE
      ? 'image'
      : config.isShareToFeedSelected
        ? 'video-feed'
        : 'video-only';

  function handleChange(value: string) {
    if (!isEnabled) {
      return;
    }

    // A Story keeps the media's own category: it is one image or one video.
    if (value === 'story') {
      updatePlatformConfig(config.credentialId, {
        isShareToFeedSelected: false,
        isStory: true,
        reelAudio: undefined,
      });
      return;
    }

    if (value === 'image') {
      updatePlatformConfig(config.credentialId, {
        category: PostCategory.IMAGE,
        isShareToFeedSelected: false,
        isStory: false,
        reelAudio: undefined,
      });
      return;
    }

    // Music needs the reel-only placement, so a Reel that also goes to the
    // feed keeps none.
    updatePlatformConfig(config.credentialId, {
      category: PostCategory.VIDEO,
      isShareToFeedSelected: value === 'video-feed',
      isStory: false,
      ...(value === 'video-feed' ? { reelAudio: undefined } : {}),
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{translate('heading')}</p>

      <RadioGroup
        className="space-y-2"
        disabled={!isEnabled || isLoading}
        value={radioValue}
        onValueChange={handleChange}
      >
        <Label
          className="flex items-center gap-2 cursor-pointer font-normal leading-normal"
          htmlFor={`${config.credentialId}-instagram-image`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-image`}
            value="image"
          />
          <span className="text-sm">{translate('image')}</span>
        </Label>

        <Label
          className="flex items-center gap-2 cursor-pointer font-normal leading-normal"
          htmlFor={`${config.credentialId}-instagram-video-only`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-video-only`}
            value="video-only"
          />
          <span className="text-sm">{translate('reelOnly')}</span>
        </Label>

        <Label
          className="flex items-center gap-2 cursor-pointer font-normal leading-normal"
          htmlFor={`${config.credentialId}-instagram-video-feed`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-video-feed`}
            value="video-feed"
          />
          <span className="text-sm">{translate('reelFeed')}</span>
        </Label>

        <Label
          className="flex items-center gap-2 cursor-pointer font-normal leading-normal"
          htmlFor={`${config.credentialId}-instagram-story`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-story`}
            value="story"
          />
          <span className="text-sm">{translate('story')}</span>
        </Label>
      </RadioGroup>

      {radioValue === 'video-only' && (
        <ModalPostPlatformInstagramMusic
          config={config}
          isEnabled={isEnabled}
          isLoading={isLoading}
          updatePlatformConfig={updatePlatformConfig}
        />
      )}
    </div>
  );
}
