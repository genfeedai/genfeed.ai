import type { IOnboardingCampaignImage } from '@genfeedai/contracts/interfaces';

const FORMAT_BY_PLATFORM: Record<IOnboardingCampaignImage['platform'], string> =
  {
    instagram: 'a portrait Instagram feed image',
    linkedin: 'a wide LinkedIn article banner',
    tiktok: 'a vertical TikTok slide',
    twitter: 'a wide X post image',
  };

/**
 * Opens the image prompt of a platform image so it reads as the same campaign
 * as the master: same subject, palette and lighting, recomposed for the format.
 */
export function buildCampaignImagePromptPrefix(
  image: Pick<IOnboardingCampaignImage, 'id' | 'platform'>,
): string {
  const secondSlide =
    image.id === 'tiktok-2'
      ? ' This is the second slide: show a closer detail of the same subject and leave clear space for text.'
      : '';
  return `Match the style, palette, lighting and subject of the first reference image, the campaign master, and recompose it as ${FORMAT_BY_PLATFORM[image.platform]}.${secondSlide}`;
}
