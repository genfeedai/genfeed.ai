import {
  APP_ROUTES,
  createPublishingPostsFilterRoute,
} from '@genfeedai/constants';
import {
  Platform,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/enums';
import * as formatHelper from '@helpers/formatting/format/format.helper';
import {
  DiscordIcon,
  FacebookIcon,
  GhostIcon,
  GoogleIcon,
  InstagramIcon,
  LinkedinIcon,
  MastodonIcon,
  MediumIcon,
  PinterestIcon,
  RedditIcon,
  ShopifyIcon,
  SlackIcon,
  SnapchatIcon,
  TelegramIcon,
  ThreadsIcon,
  TiktokIcon,
  TwitchIcon,
  WhatsappIcon,
  WordpressIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@helpers/ui/icons/brands';
import type { TabItem } from '@props/ui/navigation/tabs.props';
import { LayoutGrid, Newspaper, Star } from 'lucide-react';
import type { ComponentType } from 'react';

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

// Publishing navigation uses canonical PostStatus values for focused lifecycle
// destinations. Draft and scheduled still share the broader not-posted view.
const PUBLISHING_POST_STATUSES = [
  PostStatus.DRAFT,
  PostStatus.FAILED,
  PostStatus.PENDING,
  PostStatus.PROCESSING,
  PostStatus.SCHEDULED,
  PostStatus.PUBLIC,
] as const;

export type PublishingPostsStatus = (typeof PUBLISHING_POST_STATUSES)[number];

export interface PublishingPostsHrefOptions {
  platform?: string | null;
  status?: string | null;
}

export function getPublishingPostsStatusPath(
  status?: string | string[] | null,
): string {
  const normalizedStatus = normalizePublishingPostsStatus(status);

  if (normalizedStatus === PostStatus.PUBLIC) {
    return createPublishingPostsFilterRoute({ publicationState: 'posted' });
  }

  // Draft + scheduled share the broader not-posted filter.
  if (
    normalizedStatus === PostStatus.SCHEDULED ||
    normalizedStatus === PostStatus.DRAFT
  ) {
    return createPublishingPostsFilterRoute({
      publicationState: 'not-posted',
    });
  }

  if (
    normalizedStatus === PostStatus.FAILED ||
    normalizedStatus === PostStatus.PENDING ||
    normalizedStatus === PostStatus.PROCESSING
  ) {
    return createPublishingPostsFilterRoute({ status: normalizedStatus });
  }

  // No recognized status → canonical Posts library (all lifecycle states).
  return APP_ROUTES.PUBLISHING.POSTS;
}

/**
 * Canonical path for a single post under Publishing.
 * Renders the full PostDetail surface (same as the list sheet / admin page).
 */
export function getPublishingPostHref(postId: string): string {
  return `${APP_ROUTES.PUBLISHING.POSTS}/${postId}`;
}

export function normalizePublishingPostsStatus(
  value?: string | string[] | null,
): PublishingPostsStatus {
  const status = Array.isArray(value) ? value[0] : value;

  if (
    status === PostStatus.SCHEDULED ||
    status === PostStatus.PUBLIC ||
    status === PostStatus.FAILED ||
    status === PostStatus.PENDING ||
    status === PostStatus.PROCESSING ||
    status === PostStatus.DRAFT
  ) {
    return status;
  }

  return PostStatus.DRAFT;
}

export function getPublishingPostsHref({
  platform,
  status,
}: PublishingPostsHrefOptions = {}): string {
  const hasStatus =
    status != null &&
    String(Array.isArray(status) ? status[0] : status).length > 0;
  const normalizedPlatform = normalizePostsPlatform(platform ?? undefined);
  // No status → canonical Posts library. Pipeline shortcuts pass status.
  const path = hasStatus
    ? getPublishingPostsStatusPath(status)
    : APP_ROUTES.PUBLISHING.POSTS;

  if (normalizedPlatform === 'all') {
    return path;
  }

  // `path` may already carry a lifecycle filter query string (e.g.
  // `?publicationState=not-posted`) — merge through URLSearchParams instead
  // of naive concatenation so we never emit a second `?`.
  const [basePath, existingQuery] = path.split('?');
  const params = new URLSearchParams(existingQuery);
  params.set('platform', normalizedPlatform);

  return `${basePath}?${params.toString()}`;
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

export function getPostLifecycleOptions(): Array<{
  label: string;
  value: TargetExecutionState;
}> {
  return [
    { label: 'Draft', value: TargetExecutionState.DRAFT },
    { label: 'Scheduled', value: TargetExecutionState.SCHEDULED },
  ];
}

export function getPostVisibilityOptions(): Array<{
  label: string;
  value: PostVisibility;
}> {
  return [
    { label: 'Public', value: PostVisibility.PUBLIC },
    { label: 'Private', value: PostVisibility.PRIVATE },
    { label: 'Unlisted', value: PostVisibility.UNLISTED },
  ];
}

const PLATFORM_ICON_MAP: Record<
  PostsPlatform,
  ComponentType<{ className?: string }>
> = {
  all: LayoutGrid,
  [Platform.YOUTUBE]: YoutubeIcon,
  [Platform.INSTAGRAM]: InstagramIcon,
  [Platform.TWITTER]: XTwitterIcon,
  [Platform.TIKTOK]: TiktokIcon,
  [Platform.FACEBOOK]: FacebookIcon,
  [Platform.LINKEDIN]: LinkedinIcon,
  [Platform.PINTEREST]: PinterestIcon,
  [Platform.REDDIT]: RedditIcon,
  [Platform.DISCORD]: DiscordIcon,
  [Platform.TELEGRAM]: TelegramIcon,
  [Platform.TWITCH]: TwitchIcon,
  [Platform.MEDIUM]: MediumIcon,
  [Platform.THREADS]: ThreadsIcon,
  [Platform.FANVUE]: Star,
  [Platform.SLACK]: SlackIcon,
  [Platform.WORDPRESS]: WordpressIcon,
  [Platform.SNAPCHAT]: SnapchatIcon,
  [Platform.WHATSAPP]: WhatsappIcon,
  [Platform.MASTODON]: MastodonIcon,
  [Platform.GHOST]: GhostIcon,
  [Platform.SHOPIFY]: ShopifyIcon,
  [Platform.BEEHIIV]: Newspaper,
  [Platform.UNIPILE]: LayoutGrid,
  [Platform.GOOGLE_ADS]: GoogleIcon,
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
