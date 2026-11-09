import { AssetCategory, BrandKitSlot } from '../enums/asset.enum';
import type {
  BrandKitSlotPlatform,
  IBrandKitLogoSlotSpec,
  IBrandKitPlatformSlotSpec,
} from '../interfaces/organization/brand-kit-slot.interface';

/**
 * Logo variants, in display order. LOGO_PRIMARY is the default logo: the brand
 * avatar and every surface that does not ask for a variant uses it.
 */
export const BRAND_KIT_LOGO_SLOTS: readonly IBrandKitLogoSlotSpec[] = [
  { category: AssetCategory.LOGO, slot: BrandKitSlot.LOGO_PRIMARY },
  { category: AssetCategory.LOGO, slot: BrandKitSlot.LOGO_ICON },
  { category: AssetCategory.LOGO, slot: BrandKitSlot.LOGO_WORDMARK },
  {
    background: 'light',
    category: AssetCategory.LOGO,
    slot: BrandKitSlot.LOGO_LIGHT,
  },
  {
    background: 'dark',
    category: AssetCategory.LOGO,
    slot: BrandKitSlot.LOGO_DARK,
  },
  { category: AssetCategory.LOGO, slot: BrandKitSlot.LOGO_MONOCHROME },
];

const X_PROFILE_HELP_URL =
  'https://help.x.com/en/managing-your-account/how-to-customize-your-profile';
const YOUTUBE_BRANDING_HELP_URL =
  'https://support.google.com/youtube/answer/10456525';
const LINKEDIN_PAGE_IMAGES_HELP_URL =
  'https://www.linkedin.com/help/linkedin/answer/a563309';
const FACEBOOK_PAGE_IMAGES_HELP_URL =
  'https://www.facebook.com/help/125379114252045';

/**
 * Banner and profile image slots, in display order. Sizes come from each
 * platform's own help page (`sourceUrl`, read 2026-11-09). The master banner is
 * the X header format so it imports from and exports to X unchanged.
 */
export const BRAND_KIT_PLATFORM_SLOTS: readonly IBrandKitPlatformSlotSpec[] = [
  {
    category: AssetCategory.BANNER,
    height: 500,
    kind: 'banner',
    slot: BrandKitSlot.BANNER_MASTER,
    width: 1500,
  },
  {
    category: AssetCategory.BANNER,
    height: 500,
    kind: 'banner',
    platform: 'x',
    slot: BrandKitSlot.X_HEADER,
    sourceUrl: X_PROFILE_HELP_URL,
    width: 1500,
  },
  {
    category: AssetCategory.BANNER,
    height: 400,
    kind: 'profile',
    platform: 'x',
    slot: BrandKitSlot.X_PROFILE,
    sourceUrl: X_PROFILE_HELP_URL,
    width: 400,
  },
  {
    category: AssetCategory.BANNER,
    height: 1440,
    kind: 'banner',
    minHeight: 1152,
    minWidth: 2048,
    platform: 'youtube',
    // 1235x338 at the 2048x1152 minimum, scaled to the recommended size.
    safeArea: { height: 423, width: 1544 },
    slot: BrandKitSlot.YOUTUBE_BANNER,
    sourceUrl: YOUTUBE_BRANDING_HELP_URL,
    width: 2560,
  },
  {
    category: AssetCategory.BANNER,
    height: 800,
    kind: 'profile',
    platform: 'youtube',
    slot: BrandKitSlot.YOUTUBE_PROFILE,
    sourceUrl: YOUTUBE_BRANDING_HELP_URL,
    width: 800,
  },
  {
    category: AssetCategory.BANNER,
    height: 700,
    kind: 'banner',
    platform: 'linkedin',
    slot: BrandKitSlot.LINKEDIN_COVER,
    sourceUrl: LINKEDIN_PAGE_IMAGES_HELP_URL,
    width: 4200,
  },
  {
    category: AssetCategory.BANNER,
    height: 400,
    kind: 'profile',
    minHeight: 268,
    minWidth: 268,
    platform: 'linkedin',
    slot: BrandKitSlot.LINKEDIN_LOGO,
    sourceUrl: LINKEDIN_PAGE_IMAGES_HELP_URL,
    width: 400,
  },
  {
    category: AssetCategory.BANNER,
    height: 315,
    kind: 'banner',
    minHeight: 150,
    minWidth: 400,
    platform: 'facebook',
    slot: BrandKitSlot.FACEBOOK_COVER,
    sourceUrl: FACEBOOK_PAGE_IMAGES_HELP_URL,
    width: 851,
  },
  {
    category: AssetCategory.BANNER,
    height: 320,
    kind: 'profile',
    platform: 'facebook',
    slot: BrandKitSlot.FACEBOOK_PROFILE,
    sourceUrl: FACEBOOK_PAGE_IMAGES_HELP_URL,
    width: 320,
  },
];

const LOGO_SLOT_SET = new Set<string>(
  BRAND_KIT_LOGO_SLOTS.map((spec) => spec.slot),
);
const PLATFORM_SLOT_SET = new Set<string>(
  BRAND_KIT_PLATFORM_SLOTS.map((spec) => spec.slot),
);

/** The slot a logo or banner without one reads as. */
export function getDefaultBrandKitSlot(
  category: AssetCategory.LOGO | AssetCategory.BANNER,
): BrandKitSlot {
  return category === AssetCategory.LOGO
    ? BrandKitSlot.LOGO_PRIMARY
    : BrandKitSlot.BANNER_MASTER;
}

/** Whether a slot belongs to the category: LOGO_* for logos, the rest for banners. */
export function isBrandKitSlotForCategory(
  slot: BrandKitSlot,
  category: AssetCategory,
): boolean {
  if (category === AssetCategory.LOGO) return LOGO_SLOT_SET.has(slot);
  if (category === AssetCategory.BANNER) return PLATFORM_SLOT_SET.has(slot);
  return false;
}

export function getBrandKitPlatformSlotSpec(
  slot: BrandKitSlot,
): IBrandKitPlatformSlotSpec | undefined {
  return BRAND_KIT_PLATFORM_SLOTS.find((spec) => spec.slot === slot);
}

/** Platform image slots for one platform, banner first. */
export function getBrandKitPlatformSlots(
  platform: BrandKitSlotPlatform,
): IBrandKitPlatformSlotSpec[] {
  return BRAND_KIT_PLATFORM_SLOTS.filter((spec) => spec.platform === platform);
}

/** The logo variant drawn for a background, when the slot declares one. */
export function getBrandKitLogoSlotForBackground(
  background: 'light' | 'dark',
): BrandKitSlot {
  return background === 'light'
    ? BrandKitSlot.LOGO_LIGHT
    : BrandKitSlot.LOGO_DARK;
}
