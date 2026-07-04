import { APP_ROUTES } from '@genfeedai/constants';
import { Platform, PostStatus } from '@genfeedai/enums';
import * as formatHelper from '@helpers/formatting/format/format.helper';
import type { TabItem } from '@props/ui/navigation/tabs.props';
import type { ComponentType } from 'react';
import {
  FaDiscord,
  FaFacebook,
  FaGhost,
  FaGoogle,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaMedium,
  FaPinterest,
  FaReddit,
  FaShopify,
  FaSlack,
  FaSnapchat,
  FaStar,
  FaTelegram,
  FaThreads,
  FaTiktok,
  FaTwitch,
  FaWhatsapp,
  FaWordpress,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import { HiNewspaper, HiSquares2X2 } from 'react-icons/hi2';

export const POST_PLATFORM_VALUES = [
  Platform.YOUTUBE,
  Platform.INSTAGRAM,
  Platform.TWITTER,
  Platform.TIKTOK,
  Platform.FACEBOOK,
  Platform.LINKEDIN,
  Platform.PINTEREST,
  Platform.REDDIT,
  Platform.DISCORD,
  Platform.TELEGRAM,
  Platform.TWITCH,
  Platform.MEDIUM,
  Platform.THREADS,
  Platform.FANVUE,
  Platform.SLACK,
  Platform.WORDPRESS,
  Platform.SNAPCHAT,
  Platform.WHATSAPP,
  Platform.MASTODON,
  Platform.GHOST,
  Platform.SHOPIFY,
  Platform.BEEHIIV,
  Platform.UNIPILE,
  Platform.GOOGLE_ADS,
] as const;

export type PostPlatform = (typeof POST_PLATFORM_VALUES)[number];

export const POST_PLATFORMS = ['all', ...POST_PLATFORM_VALUES] as const;

export type PostsPlatform = 'all' | PostPlatform;

export function isPostPlatform(platform: Platform): platform is PostPlatform {
  return (POST_PLATFORM_VALUES as readonly Platform[]).includes(platform);
}

export const PLATFORM_LABEL_MAP: Record<PostsPlatform, string> = {
  all: 'All',
  [Platform.YOUTUBE]: 'YouTube',
  [Platform.INSTAGRAM]: 'Instagram',
  [Platform.TWITTER]: '(X) Twitter',
  [Platform.TIKTOK]: 'TikTok',
  [Platform.FACEBOOK]: 'Facebook',
  [Platform.LINKEDIN]: 'LinkedIn',
  [Platform.PINTEREST]: 'Pinterest',
  [Platform.REDDIT]: 'Reddit',
  [Platform.DISCORD]: 'Discord',
  [Platform.TELEGRAM]: 'Telegram',
  [Platform.TWITCH]: 'Twitch',
  [Platform.MEDIUM]: 'Medium',
  [Platform.THREADS]: 'Threads',
  [Platform.FANVUE]: 'Fanvue',
  [Platform.SLACK]: 'Slack',
  [Platform.WORDPRESS]: 'WordPress',
  [Platform.SNAPCHAT]: 'Snapchat',
  [Platform.WHATSAPP]: 'WhatsApp',
  [Platform.MASTODON]: 'Mastodon',
  [Platform.GHOST]: 'Ghost',
  [Platform.SHOPIFY]: 'Shopify',
  [Platform.BEEHIIV]: 'Beehiiv',
  [Platform.UNIPILE]: 'Unipile',
  [Platform.GOOGLE_ADS]: 'Google Ads',
};

export function normalizePostsPlatform(value?: string): PostsPlatform {
  if (!value) {
    return 'all';
  }

  const normalized = value.toLowerCase();
  if (normalized === 'all') {
    return 'all';
  }

  return isPostPlatform(normalized as Platform)
    ? (normalized as PostPlatform)
    : 'all';
}

export function getPostsPlatformLabel(
  platform: PostsPlatform | Platform,
): string {
  if (platform === 'all' || isPostPlatform(platform)) {
    return PLATFORM_LABEL_MAP[platform];
  }

  return 'Post';
}

const PUBLISHER_POST_STATUSES = [
  PostStatus.DRAFT,
  PostStatus.SCHEDULED,
  PostStatus.PUBLIC,
] as const;

export type PublisherPostsStatus = (typeof PUBLISHER_POST_STATUSES)[number];

export interface PublisherPostsHrefOptions {
  platform?: string | null;
  status?: string | null;
}

export function getPublisherPostsStatusPath(
  status?: string | string[] | null,
): string {
  const normalizedStatus = normalizePublisherPostsStatus(status);

  if (normalizedStatus === PostStatus.SCHEDULED) {
    return APP_ROUTES.POSTS.SCHEDULED;
  }

  if (normalizedStatus === PostStatus.PUBLIC) {
    return APP_ROUTES.POSTS.PUBLISHED;
  }

  return APP_ROUTES.POSTS.ROOT;
}

export function getPublisherPostsStatusFromPathname(
  pathname?: string | null,
): PublisherPostsStatus | null {
  const segments = (pathname ?? '').split('?')[0].split('/').filter(Boolean);
  const postsIndex = segments.lastIndexOf('posts');

  if (postsIndex === -1) {
    return null;
  }

  const statusSegment = segments[postsIndex + 1];
  if (statusSegment === 'scheduled') {
    return PostStatus.SCHEDULED;
  }

  if (statusSegment === 'published') {
    return PostStatus.PUBLIC;
  }

  return null;
}

export function normalizePublisherPostsStatus(
  value?: string | string[] | null,
): PublisherPostsStatus {
  const status = Array.isArray(value) ? value[0] : value;

  if (
    status === PostStatus.SCHEDULED ||
    status === PostStatus.PUBLIC ||
    status === PostStatus.DRAFT
  ) {
    return status;
  }

  return PostStatus.DRAFT;
}

export function getPublisherPostsHref({
  platform,
  status,
}: PublisherPostsHrefOptions = {}): string {
  const params = new URLSearchParams();
  const normalizedStatus = normalizePublisherPostsStatus(status);
  const normalizedPlatform = normalizePostsPlatform(platform ?? undefined);
  const path = getPublisherPostsStatusPath(normalizedStatus);

  if (normalizedPlatform !== 'all') {
    params.set('platform', normalizedPlatform);
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function getPostStatusOptions(
  includeAll = false,
): Array<{ label: string; value: string }> {
  const formStatuses = [
    PostStatus.DRAFT,
    PostStatus.SCHEDULED,
    PostStatus.PUBLIC,
    PostStatus.PRIVATE,
    PostStatus.UNLISTED,
  ];

  const options = formStatuses.map((status) => ({
    label: formatHelper.capitalize(status),
    value: status,
  }));

  return includeAll
    ? [{ label: 'All Statuses', value: '' }, ...options]
    : options;
}

const PLATFORM_ICON_MAP: Record<
  PostsPlatform,
  ComponentType<{ className?: string }>
> = {
  all: HiSquares2X2,
  [Platform.YOUTUBE]: FaYoutube,
  [Platform.INSTAGRAM]: FaInstagram,
  [Platform.TWITTER]: FaXTwitter,
  [Platform.TIKTOK]: FaTiktok,
  [Platform.FACEBOOK]: FaFacebook,
  [Platform.LINKEDIN]: FaLinkedin,
  [Platform.PINTEREST]: FaPinterest,
  [Platform.REDDIT]: FaReddit,
  [Platform.DISCORD]: FaDiscord,
  [Platform.TELEGRAM]: FaTelegram,
  [Platform.TWITCH]: FaTwitch,
  [Platform.MEDIUM]: FaMedium,
  [Platform.THREADS]: FaThreads,
  [Platform.FANVUE]: FaStar,
  [Platform.SLACK]: FaSlack,
  [Platform.WORDPRESS]: FaWordpress,
  [Platform.SNAPCHAT]: FaSnapchat,
  [Platform.WHATSAPP]: FaWhatsapp,
  [Platform.MASTODON]: FaMastodon,
  [Platform.GHOST]: FaGhost,
  [Platform.SHOPIFY]: FaShopify,
  [Platform.BEEHIIV]: HiNewspaper,
  [Platform.UNIPILE]: HiSquares2X2,
  [Platform.GOOGLE_ADS]: FaGoogle,
};

export function getPostPlatformTabs(
  platforms: PostPlatform[] = [
    Platform.YOUTUBE,
    Platform.INSTAGRAM,
    Platform.TWITTER,
    Platform.TIKTOK,
  ],
): TabItem[] {
  const allTab: TabItem = {
    icon: PLATFORM_ICON_MAP.all,
    id: 'all',
    label: 'All',
  };

  const platformTabs = platforms.map((platform) => ({
    icon: PLATFORM_ICON_MAP[platform],
    id: platform,
    label: PLATFORM_LABEL_MAP[platform],
  }));

  return [allTab, ...platformTabs];
}
