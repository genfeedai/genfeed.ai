import { createEntityAttributes } from '@genfeedai/helpers';

export const brandAttributes = createEntityAttributes([
  'user',
  'organization',
  'tags',
  'slug',
  'label',
  'watermarkText',
  'watermarkLogoId',
  'watermarkOpacity',
  'watermarkPosition',
  'watermarkSizeRatio',
  'watermarkLightLogoId',
  'watermarkLiveLogoId',
  'watermarkInsetXRatio',
  'watermarkInsetYRatio',
  'endCardAssetId',
  'endCardDurationSeconds',
  'isEndCardEnabled',
  'lutFileName',
  'isLutEnabled',
  'description',
  'text',
  'fontFamily',
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'defaultVideoModel',
  'defaultImageModel',
  'defaultImageToVideoModel',
  'defaultMusicModel',
  'scope',
  'isActive',
  'isHighlighted',
  'isFleetEnabled',
  'isDefault',
  'logoUrl',
  'bannerUrl',
  'logo',
  'banner',
  'references',
  'credentials',
  'links',
  'agentConfig',
  'instagramHandle',
  'externalId',
  'externalHandle',
]);

/**
 * Anonymous brand profile payload. An allowlist on purpose: the full
 * `brandAttributes` carry `agentConfig` (voice, strategy, prompting, schedule,
 * auto-publish), watermark and model defaults, and ownership ids, none of which
 * belong on an unauthenticated route.
 */
export const publicBrandAttributes = [
  'slug',
  'label',
  'description',
  'fontFamily',
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'isHighlighted',
  'logoUrl',
  'bannerUrl',
  'logo',
  'banner',
  'links',
  'createdAt',
  'updatedAt',
];

/**
 * What a public profile reveals about a brand's logo or banner: the picture
 * the visitor is meant to see and nothing about where or by whom it is stored
 * (no owner, organization, storage key or checksum).
 */
export const publicBrandAssetAttributes = ['category', 'cdnUrl', 'mimeType'];
