import { CredentialPlatform } from '@genfeedai/enums';
import {
  FacebookIcon,
  GoogleIcon,
  InstagramIcon,
  LinkedinIcon,
  RedditIcon,
  ThreadsIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';

export type OAuthConnectPlatformCategoryId =
  | 'social'
  | 'video'
  | 'communities'
  | 'creator'
  | 'ads';

export interface OAuthConnectPlatformCategory {
  id: OAuthConnectPlatformCategoryId;
  label: string;
}

export interface OAuthConnectPlatform {
  category: OAuthConnectPlatformCategoryId;
  /**
   * Unique list key when multiple tiles share one {@link platform}
   * (e.g. Meta Ads + Facebook organic both use FACEBOOK credentials).
   */
  connectId?: string;
  icon: ReactNode;
  label: string;
  platform: CredentialPlatform;
  /**
   * Nest route segment under `/v1/services/{path}/connect`.
   * Defaults via {@link resolveOAuthServicePath}.
   */
  servicePath?: string;
}

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
    { id: 'social', label: 'Social networks' },
    { id: 'video', label: 'Video' },
    { id: 'communities', label: 'Communities' },
    { id: 'creator', label: 'Creator' },
    { id: 'ads', label: 'Advertising' },
  ];

/**
 * Platforms with a brand OAuth `POST services/{path}/connect` endpoint that the
 * settings Connect button actually calls.
 *
 * Not listed (service helpers exist, but no UI-compatible connect route yet):
 * Mastodon, Snapchat, Pinterest, Shopify, WordPress, TikTok Ads (API-only).
 *
 * Ads notes:
 * - Meta Ads reuses Facebook OAuth (ads_management scopes on FACEBOOK).
 * - YouTube Ads reuses Google Ads OAuth (YouTube campaigns live in Google Ads).
 *
 * Shared by brand social settings + agent connect menu. Only add a platform
 * here when `POST /v1/services/<path>/connect` is live.
 */
export const OAUTH_CONNECT_PLATFORMS: OAuthConnectPlatform[] = [
  {
    category: 'social',
    icon: <XTwitterIcon className="mr-1.5 size-3.5" />,
    label: 'Twitter',
    platform: CredentialPlatform.TWITTER,
  },
  {
    category: 'social',
    icon: <InstagramIcon className="mr-1.5 size-3.5" />,
    label: 'Instagram',
    platform: CredentialPlatform.INSTAGRAM,
  },
  {
    category: 'social',
    icon: <FacebookIcon className="mr-1.5 size-3.5" />,
    label: 'Facebook',
    platform: CredentialPlatform.FACEBOOK,
  },
  {
    category: 'social',
    icon: <LinkedinIcon className="mr-1.5 size-3.5" />,
    label: 'LinkedIn',
    platform: CredentialPlatform.LINKEDIN,
  },
  {
    category: 'social',
    icon: <ThreadsIcon className="mr-1.5 size-3.5" />,
    label: 'Threads',
    platform: CredentialPlatform.THREADS,
  },
  {
    category: 'video',
    icon: <YoutubeIcon className="mr-1.5 size-3.5" />,
    label: 'YouTube',
    platform: CredentialPlatform.YOUTUBE,
  },
  {
    category: 'video',
    icon: <TiktokIcon className="mr-1.5 size-3.5" />,
    label: 'TikTok',
    platform: CredentialPlatform.TIKTOK,
  },
  {
    category: 'communities',
    icon: <RedditIcon className="mr-1.5 size-3.5" />,
    label: 'Reddit',
    platform: CredentialPlatform.REDDIT,
  },
  {
    category: 'creator',
    icon: <Star className="mr-1.5 size-3.5" />,
    label: 'Fanvue',
    platform: CredentialPlatform.FANVUE,
  },
  {
    category: 'ads',
    connectId: 'meta-ads',
    icon: <FacebookIcon className="mr-1.5 size-3.5" />,
    label: 'Meta Ads',
    // Marketing API reuses the Facebook credential + ads scopes.
    platform: CredentialPlatform.FACEBOOK,
    servicePath: 'facebook',
  },
  {
    category: 'ads',
    connectId: 'google-ads',
    icon: <GoogleIcon className="mr-1.5 size-3.5" />,
    label: 'Google Ads',
    platform: CredentialPlatform.GOOGLE_ADS,
    servicePath: 'google-ads',
  },
  {
    category: 'ads',
    connectId: 'youtube-ads',
    icon: <YoutubeIcon className="mr-1.5 size-3.5" />,
    label: 'YouTube Ads',
    // YouTube campaigns are bought through Google Ads OAuth.
    platform: CredentialPlatform.GOOGLE_ADS,
    servicePath: 'google-ads',
  },
];

export type OAuthConnectPlatformGroup = OAuthConnectPlatformCategory & {
  platforms: OAuthConnectPlatform[];
};

/**
 * Group platforms by category for categorized connect UIs. Empty categories
 * are dropped. Pass a filtered list (e.g. unconnected only) to keep grouping.
 */
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
