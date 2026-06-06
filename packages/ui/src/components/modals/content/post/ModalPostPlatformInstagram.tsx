'use client';

import { PostCategory } from '@genfeedai/enums';
import type { IPostPlatformConfig } from '@genfeedai/interfaces';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';

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
  const radioValue =
    config.category === PostCategory.IMAGE
      ? 'image'
      : config.isShareToFeedSelected
        ? 'video-feed'
        : 'video-only';

  function handleChange(value: string) {
    if (!isEnabled) {
      return;
    }

    if (value === 'image') {
      updatePlatformConfig(config.credentialId, {
        category: PostCategory.IMAGE,
        isShareToFeedSelected: false,
      });
      return;
    }

    updatePlatformConfig(config.credentialId, {
      category: PostCategory.VIDEO,
      isShareToFeedSelected: value === 'video-feed',
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Instagram Post Type</p>

      <RadioGroup
        className="space-y-2"
        disabled={!isEnabled || isLoading}
        value={radioValue}
        onValueChange={handleChange}
      >
        <label
          className="flex items-center gap-2 cursor-pointer"
          htmlFor={`${config.credentialId}-instagram-image`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-image`}
            value="image"
          />
          <span className="text-sm">Image Post</span>
        </label>

        <label
          className="flex items-center gap-2 cursor-pointer"
          htmlFor={`${config.credentialId}-instagram-video-only`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-video-only`}
            value="video-only"
          />
          <span className="text-sm">Reel only</span>
        </label>

        <label
          className="flex items-center gap-2 cursor-pointer"
          htmlFor={`${config.credentialId}-instagram-video-feed`}
        >
          <RadioGroupItem
            id={`${config.credentialId}-instagram-video-feed`}
            value="video-feed"
          />
          <span className="text-sm">Reel + Feed</span>
        </label>
      </RadioGroup>
    </div>
  );
}
