import { Platform } from './platform.enum';

const PLATFORM_VALUES = new Set<string>(Object.values(Platform));

/**
 * Free-text aliases that normalize onto a canonical {@link Platform} value.
 * Storage/API always use the enum member string (e.g. `twitter`), never the alias.
 */
const PLATFORM_ALIASES: Readonly<Record<string, Platform>> = {
  // Product UI / model free-text for X
  x: Platform.TWITTER,
  // Ads research and Meta API often say "meta" for Facebook placements
  meta: Platform.FACEBOOK,
  // Occasional compound forms
  x_twitter: Platform.TWITTER,
  twitter_x: Platform.TWITTER,
};

/**
 * Display labels that are not simple title-case of the enum value.
 * Prefer this over ad-hoc `=== 'youtube' ? 'YouTube'` branches.
 */
export const PLATFORM_DISPLAY_LABELS: Readonly<
  Partial<Record<Platform, string>>
> = {
  [Platform.BEEHIIV]: 'Beehiiv',
  [Platform.DEV_TO]: 'Dev.to',
  [Platform.GOOGLE_ADS]: 'Google Ads',
  [Platform.GOOGLE_SEARCH_CONSOLE]: 'Google Search Console',
  [Platform.HACKER_NEWS]: 'Hacker News',
  [Platform.LINKEDIN]: 'LinkedIn',
  [Platform.PRODUCT_HUNT]: 'Product Hunt',
  [Platform.TIKTOK]: 'TikTok',
  [Platform.TWITTER]: 'X',
  [Platform.WHATSAPP]: 'WhatsApp',
  [Platform.WORDPRESS]: 'WordPress',
  [Platform.YOUTUBE]: 'YouTube',
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && PLATFORM_VALUES.has(value);
}

/**
 * Parse free text into a canonical {@link Platform}.
 * Accepts enum values and known aliases (`x` → twitter, `meta` → facebook).
 */
export function parsePlatform(value: unknown): Platform | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (PLATFORM_VALUES.has(normalized)) {
    return normalized as Platform;
  }

  return PLATFORM_ALIASES[normalized];
}

/**
 * Short human label for UI/cards/logs.
 * Returns null when the input is empty/non-string.
 */
export function formatPlatformLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const platform = parsePlatform(trimmed);
  if (platform) {
    return (
      PLATFORM_DISPLAY_LABELS[platform] ??
      platform
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    );
  }

  // Unknown free text — title-case as a last resort so callers still get a label.
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function isTwitterPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.TWITTER;
}

export function isYouTubePlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.YOUTUBE;
}

export function isTikTokPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.TIKTOK;
}

export function isInstagramPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.INSTAGRAM;
}

export function isLinkedInPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.LINKEDIN;
}

export function isFacebookPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.FACEBOOK;
}

export function isRedditPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.REDDIT;
}

export function isTwitchPlatform(value: unknown): boolean {
  return parsePlatform(value) === Platform.TWITCH;
}
