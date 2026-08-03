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
  icon: ReactNode;
  label: string;
  platform: CredentialPlatform;
  servicePath?: string;
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
 * Mastodon, Snapchat, Pinterest, Shopify, WordPress.
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
    icon: <GoogleIcon className="mr-1.5 size-3.5" />,
    label: 'Google Ads',
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
