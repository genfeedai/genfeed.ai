import {
  ArticleCategory,
  formatPlatformLabel,
  IngredientCategory,
  Platform,
  PostFormat,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IIngredient,
  IPost,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import { stripHtmlToSingleLine } from '@helpers/security/strip-html.helper';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';
import type {
  PublishingContentAccount,
  PublishingContentBoardColumn,
  PublishingContentFormat,
  PublishingContentMedia,
} from '@/features/posts/props/publishing-content-entry.props';

const SEPARATORS_PATTERN = /[_-]/g;

export const PUBLISHING_CONTENT_TYPES = [
  'post',
  'article',
  'newsletter',
] as const;

type PublishingContentType = (typeof PUBLISHING_CONTENT_TYPES)[number];
export type PublishingContentTypeFilter = PublishingContentType | 'all';

export interface PublishingContentLibraryItem {
  accounts?: PublishingContentAccount[];
  channels?: string[];
  format?: PublishingContentFormat;
  /** Every channel is a TikTok Inbox receipt: delivered, not a live post. */
  isInboxDelivery?: boolean;
  /** First media item of a social post; `null` when the post is text only. */
  media?: PublishingContentMedia | null;
  release?: IReleaseGroup;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  channel: string;
  createdAt: string;
  id: string;
  status: string;
  summary: string;
  title: string;
  type: PublishingContentType;
}

export interface PublishingContentLibraryFilters {
  channel: string;
  search: string;
  status: string | string[];
  type: PublishingContentTypeFilter;
}

export function publishingContentTitle(value?: string): string {
  return stripHtmlToSingleLine(value) || 'Untitled post';
}

function normalizedStatus(status?: string): string {
  const value = status?.trim().toLowerCase() || 'draft';
  return value === 'public' ? 'published' : value;
}

/** The release holds only TikTok Inbox receipts, so nothing in it is live. */
function isInboxOnlyRelease(release: IReleaseGroup): boolean {
  const targets = Array.isArray(release.targets) ? release.targets : [];
  return (
    targets.length > 0 && targets.every((target) => target.isInboxDelivery)
  );
}

function newestFirst(
  left: PublishingContentLibraryItem,
  right: PublishingContentLibraryItem,
): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function formatPublishingContentType(type: PublishingContentType): string {
  switch (type) {
    case 'article':
      return 'Article';
    case 'newsletter':
      return 'Newsletter';
    case 'post':
      return 'Social post';
  }
}

export function formatPublishingContentFormat(
  format: PublishingContentFormat,
): string {
  switch (format) {
    case 'article':
      return 'Article';
    case 'long-post':
      return 'Long post';
    case 'newsletter':
      return 'Newsletter';
    case 'thread':
      return 'Thread';
    case 'video':
      return 'Video';
  }
}

function resolvePostFormat(post: IPost): PublishingContentFormat | undefined {
  if (post.format === PostFormat.THREAD) {
    return 'thread';
  }
  if (post.format === PostFormat.LONG_FORM) {
    return 'long-post';
  }
  if (
    post.ingredients?.some(
      (ingredient) => ingredient.category === IngredientCategory.VIDEO,
    )
  ) {
    return 'video';
  }
  return undefined;
}

const VIDEO_CATEGORIES = new Set<string>([
  IngredientCategory.VIDEO,
  IngredientCategory.VIDEO_EDIT,
]);

function toPostMedia(
  ingredient: IIngredient | undefined,
): PublishingContentMedia | null {
  return ingredient
    ? { ingredient, isVideo: VIDEO_CATEGORIES.has(ingredient.category) }
    : null;
}

/** A deleted ingredient keeps its link to the post but its file is gone. */
function firstLiveIngredient(
  ingredients: readonly IIngredient[] | undefined,
): IIngredient | undefined {
  return ingredients?.find((ingredient) => ingredient.isDeleted !== true);
}

/**
 * A release stores its media as asset ids only (no URL), so the first item is
 * resolved from the loaded posts, which carry the hydrated ingredients. A
 * release whose first asset is in none of them still shows a URL when the
 * response carried one. A release with no media at all takes the first image
 * of its target posts.
 */
function toReleaseMedia(
  media: IReleaseGroup['media'] | undefined,
  ingredientsByAssetId: ReadonlyMap<string, IIngredient>,
  targetPosts: readonly IPost[],
): PublishingContentMedia | null {
  const first = [...(Array.isArray(media) ? media : [])].sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  )[0];
  if (!first) {
    // The API projects a lone post as a release with no media of its own, so
    // the post carries the images.
    return toPostMedia(
      targetPosts
        .map((post) => firstLiveIngredient(post.ingredients))
        .find((ingredient) => ingredient !== undefined),
    );
  }
  const ingredient = ingredientsByAssetId.get(first.assetId);
  if (ingredient) {
    return toPostMedia(ingredient);
  }
  return first.url ? { isVideo: first.kind === 'video', url: first.url } : null;
}

export function createPublishingContentAccounts(
  credentials: (ICredential | undefined)[],
): PublishingContentAccount[] {
  return credentials.flatMap((credential) =>
    credential
      ? [{ ...toConnectedAccount(credential), id: credential.id }]
      : [],
  );
}

function toAccounts(
  credentials: (ICredential | undefined)[],
): PublishingContentAccount[] | undefined {
  const accounts = createPublishingContentAccounts(credentials);
  return accounts.length > 0 ? accounts : undefined;
}

export function formatPublishingContentStatus(status: string): string {
  return status
    .split(SEPARATORS_PATTERN)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function formatPublishingContentChannel(channel: string): string {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'social':
      return 'Social';
    case 'web':
      return 'Website';
    default:
      return (
        formatPlatformLabel(channel) ?? formatPublishingContentStatus(channel)
      );
  }
}

export function createPublishingContentLibraryItems({
  articles,
  newsletters,
  posts,
  releases = [],
}: {
  articles: Pick<
    Article,
    'id' | 'createdAt' | 'label' | 'status' | 'summary' | 'content' | 'category'
  >[];
  newsletters: Newsletter[];
  posts: IPost[];
  releases?: IReleaseGroup[];
}): PublishingContentLibraryItem[] {
  const releasePostIds = new Set(
    releases.flatMap((release) =>
      (Array.isArray(release.targets) ? release.targets : []).map(
        (target) => target.id,
      ),
    ),
  );
  const releaseIds = new Set(releases.map((release) => release.id));
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const ingredientsByAssetId = new Map<string, IIngredient>(
    posts.flatMap((post) =>
      (post.ingredients ?? []).map((ingredient): [string, IIngredient] => [
        ingredient.id,
        ingredient,
      ]),
    ),
  );
  const releaseItems: PublishingContentLibraryItem[] = releases.map(
    (release) => ({
      accounts: toAccounts(
        (Array.isArray(release.targets) ? release.targets : []).map(
          (target) => target.credential,
        ),
      ),
      channel: release.targets?.[0]?.platform ?? 'social',
      channels: (Array.isArray(release.targets) ? release.targets : []).map(
        (target) => target.platform,
      ),
      createdAt: release.createdAt,
      id: release.id,
      isInboxDelivery: isInboxOnlyRelease(release),
      media: toReleaseMedia(
        release.media,
        ingredientsByAssetId,
        (Array.isArray(release.targets) ? release.targets : []).flatMap(
          (target) => postsById.get(target.id) ?? [],
        ),
      ),
      publishedAt: release.publishedAt ?? null,
      release,
      scheduledAt: release.scheduledAt,
      status: normalizedStatus(release.status),
      summary: stripHtmlToSingleLine(release.baseContent),
      title:
        stripHtmlToSingleLine(release.title) ||
        stripHtmlToSingleLine(release.baseContent) ||
        'Untitled post',
      type: 'post',
    }),
  );
  const postItems: PublishingContentLibraryItem[] = posts
    .filter(
      (post) =>
        !releasePostIds.has(post.id) &&
        !(post.groupId && releaseIds.has(post.groupId)),
    )
    .map((post) => ({
      accounts: toAccounts([post.credential]),
      channel: post.platform ?? 'social',
      createdAt: post.createdAt,
      format: resolvePostFormat(post),
      id: post.id,
      isInboxDelivery: post.isInboxDelivery === true,
      media: toPostMedia(firstLiveIngredient(post.ingredients)),
      publishedAt: post.publishedAt
        ? new Date(post.publishedAt).toISOString()
        : null,
      scheduledAt: post.scheduledDate
        ? new Date(post.scheduledDate).toISOString()
        : null,
      // An Inbox receipt is stored as published; it lists with the drafts.
      status: post.isInboxDelivery ? 'draft' : normalizedStatus(post.status),
      summary: stripHtmlToSingleLine(post.description),
      title:
        post.label?.trim() ||
        stripHtmlToSingleLine(post.description) ||
        'Untitled post',
      type: 'post',
    }));

  const articleItems: PublishingContentLibraryItem[] = articles.map(
    (article) => ({
      channel:
        article.category === ArticleCategory.X_ARTICLE
          ? Platform.TWITTER
          : 'web',
      createdAt: article.createdAt,
      format: 'article',
      id: article.id,
      status: normalizedStatus(article.status),
      summary: stripHtmlToSingleLine(article.summary || article.content),
      title: article.label?.trim() || 'Untitled article',
      type: 'article',
    }),
  );

  const newsletterItems: PublishingContentLibraryItem[] = newsletters.map(
    (newsletter) => ({
      channel: 'email',
      createdAt: newsletter.createdAt,
      format: 'newsletter',
      id: newsletter.id,
      status: normalizedStatus(newsletter.status),
      summary: stripHtmlToSingleLine(newsletter.summary || newsletter.topic),
      title: newsletter.label?.trim() || 'Untitled newsletter',
      type: 'newsletter',
    }),
  );

  return [
    ...releaseItems,
    ...postItems,
    ...articleItems,
    ...newsletterItems,
  ].sort(newestFirst);
}

const CHANNEL_ACCOUNT_PREFIX = 'account:';

function matchesChannel(
  item: PublishingContentLibraryItem,
  channel: string,
): boolean {
  if (channel.startsWith(CHANNEL_ACCOUNT_PREFIX)) {
    const accountId = channel.slice(CHANNEL_ACCOUNT_PREFIX.length);
    return item.accounts?.some((account) => account.id === accountId) ?? false;
  }
  return (item.channels ?? [item.channel]).includes(channel);
}

export function filterPublishingContentLibraryItems(
  items: PublishingContentLibraryItem[],
  filters: PublishingContentLibraryFilters,
): PublishingContentLibraryItem[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.type !== 'all' && item.type !== filters.type) {
      return false;
    }

    if (filters.channel !== 'all' && !matchesChannel(item, filters.channel)) {
      return false;
    }

    const statuses = Array.isArray(filters.status)
      ? filters.status
      : filters.status === 'all'
        ? []
        : [filters.status];
    if (
      statuses.length &&
      !statuses.includes(item.status) &&
      !(statuses.includes('not-posted') && item.status !== 'published')
    ) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.title,
      item.summary,
      formatPublishingContentType(item.type),
      formatPublishingContentChannel(item.channel),
      formatPublishingContentStatus(item.status),
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });
}

export function parsePublishingContentType(
  value: string | null,
): PublishingContentTypeFilter {
  return value &&
    PUBLISHING_CONTENT_TYPES.includes(value as PublishingContentType)
    ? (value as PublishingContentType)
    : 'all';
}

/** Board columns that always show, so an empty one still reads as a lane. */
const BOARD_LANES = ['draft', 'scheduled', 'publishing', 'published', 'failed'];
/** Where every known status sits, left to right, from first draft to outcome. */
const BOARD_ORDER = [
  'draft',
  'pending',
  'review',
  'paused',
  'scheduled',
  'processing',
  'publishing',
  'published',
  'partially-published',
  'private',
  'unlisted',
  'failed',
  'cancelled',
];

function boardRank(status: string): number {
  const index = BOARD_ORDER.indexOf(status.replace(SEPARATORS_PATTERN, '-'));
  return index === -1 ? BOARD_ORDER.length : index;
}

/**
 * The Posts board's columns, in lifecycle order. The five main lanes always
 * show; any other status gets a column only when a post has it. With a status
 * filter on, only the statuses that still have posts show.
 */
export function createPublishingBoardColumns(
  items: PublishingContentLibraryItem[],
  isStatusFiltered: boolean,
): PublishingContentBoardColumn[] {
  const present = new Set(items.map((item) => item.status));
  const statuses = isStatusFiltered
    ? [...present]
    : [...new Set([...BOARD_LANES, ...present])];

  return statuses
    .sort((left, right) => boardRank(left) - boardRank(right))
    .map((status) => ({
      items: items.filter((item) => item.status === status),
      label: formatPublishingContentStatus(status),
      status,
    }));
}
