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
  [Platform.RESTREAM]: 'Restream',
  [Platform.TIKTOK]: 'TikTok',
  [Platform.TWITTER]: 'X',
  [Platform.WHATSAPP]: 'WhatsApp',
  [Platform.WORDPRESS]: 'WordPress',
  [Platform.X_ADS]: 'X Ads',
  [Platform.YOUTUBE]: 'YouTube',
};

/** Compact labels for space-constrained platform indicators such as calendars. */
const PLATFORM_COMPACT_LABELS: Readonly<Record<Platform, string>> = {
  [Platform.BEEHIIV]: 'BH',
  [Platform.DEV_TO]: 'DEV',
  [Platform.DISCORD]: 'DC',
  [Platform.FACEBOOK]: 'FB',
  [Platform.FANVUE]: 'FV',
  [Platform.GHOST]: 'GH',
  [Platform.GOOGLE_ADS]: 'GA',
  [Platform.GOOGLE_SEARCH_CONSOLE]: 'GSC',
  [Platform.HACKER_NEWS]: 'HN',
  [Platform.INSTAGRAM]: 'IG',
  [Platform.LINKEDIN]: 'LI',
  [Platform.MASTODON]: 'MA',
  [Platform.MEDIUM]: 'MD',
  [Platform.PINTEREST]: 'PI',
  [Platform.PRODUCT_HUNT]: 'PH',
  [Platform.REDDIT]: 'RD',
  [Platform.RESTREAM]: 'RS',
  [Platform.SHOPIFY]: 'SH',
  [Platform.SLACK]: 'SL',
  [Platform.SNAPCHAT]: 'SC',
  [Platform.TELEGRAM]: 'TG',
  [Platform.THREADS]: 'TH',
  [Platform.TIKTOK]: 'TT',
  [Platform.TWITCH]: 'TW',
  [Platform.TWITTER]: 'X',
  [Platform.UNIPILE]: 'UP',
  [Platform.WHATSAPP]: 'WA',
  [Platform.WORDPRESS]: 'WP',
  [Platform.X_ADS]: 'XA',
  [Platform.YOUTUBE]: 'YT',
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

/**
 * Space-constrained counterpart to {@link formatPlatformLabel}. Known aliases
 * still normalize through {@link parsePlatform}; unknown text gets a stable
 * two-character fallback rather than disappearing from the UI.
 */
export function formatCompactPlatformLabel(value: unknown): string | null {
  const platform = parsePlatform(value);
  if (platform) {
    return PLATFORM_COMPACT_LABELS[platform];
  }

  const label = formatPlatformLabel(value);
  if (!label) {
    return null;
  }

  return label.length <= 3
    ? label.toUpperCase()
    : label.slice(0, 2).toUpperCase();
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

/**
 * Platforms that source-post variation generation currently supports.
 * Values are {@link Platform} members, not a separate vocabulary.
 */
export const SOURCE_POST_VARIATION_PLATFORMS = [
  Platform.INSTAGRAM,
  Platform.LINKEDIN,
  Platform.TIKTOK,
  Platform.TWITTER,
] as const;

export type SourcePostVariationPlatform =
  (typeof SOURCE_POST_VARIATION_PLATFORMS)[number];

const SOURCE_POST_VARIATION_PLATFORM_SET = new Set<string>(
  SOURCE_POST_VARIATION_PLATFORMS,
);

export function isSourcePostVariationPlatform(
  value: unknown,
): value is SourcePostVariationPlatform {
  const platform = parsePlatform(value);
  return (
    platform !== undefined && SOURCE_POST_VARIATION_PLATFORM_SET.has(platform)
  );
}
