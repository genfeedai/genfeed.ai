import { CredentialPlatform } from '@genfeedai/contracts';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import {
  DevIcon,
  FacebookIcon,
  GhostIcon,
  GoogleColorIcon,
  InstagramIcon,
  LinkedinIcon,
  ThreadsIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Newspaper, Radio, Star } from 'lucide-react';

export type OAuthConnectPlatformCategoryId =
  | 'social'
  | 'video'
  | 'communities'
  | 'creator'
  | 'publishing'
  | 'ads';

/**
 * How a tile connects: `oauth` redirects to the provider, `api_key` asks for a
 * site URL and key in a form and stores the credential directly.
 */
export type OAuthConnectMethod = 'oauth' | 'api_key';

export interface OAuthConnectPlatformCategory {
  id: OAuthConnectPlatformCategoryId;
  label: string;
  description: string;
}

export interface OAuthConnectPlatform {
  category: OAuthConnectPlatformCategoryId;
  /**
   * Defaults to `oauth`. Only the brand Connect Account modal renders
   * `api_key`: it opens a key form (plus the site URL for Ghost).
   */
  connectMethod?: OAuthConnectMethod;
  /**
   * Unique list key when multiple tiles share one {@link platform}
   * (e.g. Meta Ads + Facebook organic both use FACEBOOK credentials).
   */
  connectId?: string;
  /**
   * Brand mark for this tile. It belongs to the tile, not to {@link platform}.
   */
  Icon: IconComponent;
  /** Brand colour for {@link Icon}. */
  iconClassName: string;
  label: string;
  platform: CredentialPlatform;
  /**
   * Nest route segment under `/v1/services/{path}/connect`.
   * Defaults via {@link resolveOAuthServicePath}.
   */
  servicePath?: string;
  /** Server capability whose unknown/unavailable state must fail closed. */
  readinessKey?: OAuthConnectReadinessKey;
}

export type OAuthConnectReadiness = 'available' | 'unavailable' | 'unknown';

export type OAuthConnectReadinessKey = 'threads';

export type OAuthConnectReadinessState = Partial<
  Record<OAuthConnectReadinessKey, OAuthConnectReadiness>
>;

export type ResolvedOAuthConnectPlatform = OAuthConnectPlatform & {
  isConnectAvailable: boolean;
  readiness: OAuthConnectReadiness;
};

/**
 * Map a CredentialPlatform (or connect tile) to the Nest services path.
 * Enums use underscores (`google_ads`); API controllers use hyphens
 * (`google-ads`). Agent hooks used to pass the enum raw and 404'd.
 */
export function resolveOAuthServicePath(
  platform: string,
  servicePath?: string,
): string {
  const explicit = servicePath?.trim();
  if (explicit) {
    return explicit;
  }

  return platform.replaceAll('_', '-');
}

/**
 * Display order for connect surfaces. Categories with no platforms are omitted
 * by {@link groupOAuthConnectPlatforms}.
 */
export const OAUTH_CONNECT_PLATFORM_CATEGORIES: OAuthConnectPlatformCategory[] =
  [
    {
      id: 'social',
      label: 'Social networks',
      description: 'Post and manage text, image, and link updates.',
    },
    {
      id: 'video',
      label: 'Video',
      description: 'Publish long-form and short-form video content.',
    },
    {
      id: 'communities',
      label: 'Communities',
      description: 'Reach members of forums and community spaces.',
    },
    {
      id: 'creator',
      label: 'Creator',
      description: 'Manage subscriber and fan platform integrations.',
    },
    {
      id: 'publishing',
      label: 'Publishing',
      description: 'Deliver long-form articles to your blog or newsletter.',
    },
    {
      id: 'ads',
      label: 'Advertising',
      description: 'Connect ad accounts to run and track campaigns.',
    },
  ];

/**
 * Platforms with a brand `POST services/{path}/connect` endpoint that the
 * settings Connect button actually calls. OAuth tiles redirect to the provider;
 * `connectMethod: 'api_key'` tiles (Ghost, dev.to, Beehiiv) open a key form
 * instead.
 *
 * Not listed:
 * - Mastodon, Snapchat, Pinterest, Shopify, WordPress, TikTok Ads (API-only),
 *   do not have a UI-compatible OAuth connect route.
 * - Medium: its connect route is OAuth (client id + redirect), not a key, so
 *   it cannot use the key form; an OAuth tile for it is a separate decision.
 * - Reddit has a route, but Genfeed does not have approved Reddit Data API
 *   access, so exposing it would send customers into a non-functional flow.
 * - X Ads remains hidden until its OAuth 1.0a migration is complete (#3590).
 *
 * Ads notes:
 * - Meta Ads reuses Facebook OAuth (ads_management scopes on FACEBOOK).
 * - YouTube campaigns are bought in Google Ads. One Google Ads OAuth tile
 *   covers Search, Display, and YouTube — do not add a second connection.
 *
 * Shared by brand social settings + agent connect menu. Only add a platform
 * here when `POST /v1/services/<path>/connect` is live.
 */
export const OAUTH_CONNECT_PLATFORMS: OAuthConnectPlatform[] = [
  {
    category: 'social',
    Icon: XTwitterIcon,
    iconClassName: 'text-foreground',
    label: 'X',
    platform: CredentialPlatform.TWITTER,
  },
  {
    category: 'social',
    Icon: InstagramIcon,
    iconClassName: 'text-pink-500',
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    category: 'social',
    Icon: FacebookIcon,
    iconClassName: 'text-blue-600',
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    category: 'social',
    Icon: LinkedinIcon,
    iconClassName: 'text-blue-700',
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    category: 'social',
    Icon: ThreadsIcon,
    iconClassName: 'text-foreground',
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
    readinessKey: 'threads',
  },
  {
    category: 'video',
    Icon: YoutubeIcon,
    iconClassName: 'text-red-500',
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    category: 'video',
    Icon: TiktokIcon,
    iconClassName: 'text-foreground',
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    category: 'video',
    Icon: Radio,
    iconClassName: 'text-violet-500',
    label: 'Restream',
    platform: CredentialPlatform.RESTREAM,
    servicePath: 'restream',
  },
  {
    category: 'creator',
    Icon: Star,
    iconClassName: 'text-violet-500',
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
    servicePath: 'fanvue',
  },
  {
    category: 'publishing',
    connectMethod: 'api_key',
    Icon: GhostIcon,
    iconClassName: 'text-foreground',
    label: 'Ghost',
    platform: CredentialPlatform.GHOST,
    servicePath: 'ghost',
  },
  {
    category: 'publishing',
    connectMethod: 'api_key',
    Icon: DevIcon,
    iconClassName: 'text-foreground',
    label: 'dev.to',
    platform: CredentialPlatform.DEV_TO,
    servicePath: 'devto',
  },
  {
    category: 'publishing',
    connectMethod: 'api_key',
    // Same mark the platform badge uses for Beehiiv.
    Icon: Newspaper,
    iconClassName: 'text-platform-beehiiv',
    label: 'Beehiiv',
    platform: CredentialPlatform.BEEHIIV,
    servicePath: 'beehiiv',
  },
  {
    category: 'ads',
    connectId: 'meta-ads',
    Icon: FacebookIcon,
    iconClassName: 'text-blue-600',
    label: 'Meta Ads',
    // Marketing API reuses the Facebook credential + ads scopes.
    platform: CredentialPlatform.FACEBOOK,
    servicePath: 'facebook',
  },
  {
    category: 'ads',
    connectId: 'google-ads',
    Icon: GoogleColorIcon,
    // GoogleColorIcon carries its own brand fills; the class only sizes it.
    iconClassName: 'text-foreground',
    label: 'Google Ads',
    platform: CredentialPlatform.GOOGLE_ADS,
    servicePath: 'google-ads',
  },
];

/** True when a tile connects through a credential form rather than a redirect. */
export function isApiKeyConnectPlatform(
  platform: Pick<OAuthConnectPlatform, 'connectMethod'>,
): boolean {
  return platform.connectMethod === 'api_key';
}

/**
 * Apply live server readiness to the shared connect catalog. Platforms without
 * an explicit readiness key retain their existing behavior. Gated platforms
 * fail closed until the capability is positively available.
 */
export function resolveOAuthConnectPlatformCatalog(
  readinessState: OAuthConnectReadinessState = {},
): ResolvedOAuthConnectPlatform[] {
  return OAUTH_CONNECT_PLATFORMS.map((platform) => {
    const readiness = platform.readinessKey
      ? (readinessState[platform.readinessKey] ?? 'unknown')
      : 'available';

    return {
      ...platform,
      isConnectAvailable: readiness === 'available',
      readiness,
    };
  });
}

export type OAuthConnectPlatformGroup<
  TPlatform extends OAuthConnectPlatform = OAuthConnectPlatform,
> = OAuthConnectPlatformCategory & {
  platforms: TPlatform[];
};

/**
 * Group platforms by category for categorized connect UIs. Empty categories
 * are dropped. Pass a filtered list (e.g. unconnected only) to keep grouping.
 */
export function groupOAuthConnectPlatforms(): OAuthConnectPlatformGroup[];
export function groupOAuthConnectPlatforms<
  TPlatform extends OAuthConnectPlatform,
>(platforms: TPlatform[]): OAuthConnectPlatformGroup<TPlatform>[];
export function groupOAuthConnectPlatforms(
  platforms: OAuthConnectPlatform[] = OAUTH_CONNECT_PLATFORMS,
): OAuthConnectPlatformGroup[] {
  return OAUTH_CONNECT_PLATFORM_CATEGORIES.map((category) => ({
    ...category,
    platforms: platforms.filter(
      (platform) => platform.category === category.id,
    ),
  })).filter((group) => group.platforms.length > 0);
}
