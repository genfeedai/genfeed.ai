import {
  ArticleCategory,
  formatPlatformLabel,
  Platform,
} from '@genfeedai/contracts';
import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';

export const PUBLISHING_CONTENT_TYPES = [
  'post',
  'article',
  'newsletter',
] as const;

export type PublishingContentType = (typeof PUBLISHING_CONTENT_TYPES)[number];
export type PublishingContentTypeFilter = PublishingContentType | 'all';

export interface PublishingContentLibraryItem {
  channels?: string[];
  release?: IReleaseGroup;
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

function stripHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedStatus(status?: string): string {
  const value = status?.trim().toLowerCase() || 'draft';
  return value === 'public' ? 'published' : value;
}

function newestFirst(
  left: PublishingContentLibraryItem,
  right: PublishingContentLibraryItem,
): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

export function formatPublishingContentType(
  type: PublishingContentType,
): string {
  switch (type) {
    case 'article':
      return 'Article';
    case 'newsletter':
      return 'Newsletter';
    case 'post':
      return 'Social post';
  }
}

export function formatPublishingContentStatus(status: string): string {
  return status
    .split(/[_-]/g)
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
  const releaseItems: PublishingContentLibraryItem[] = releases.map(
    (release) => ({
      channel: release.targets?.[0]?.platform ?? 'social',
      channels: (Array.isArray(release.targets) ? release.targets : []).map(
        (target) => target.platform,
      ),
      createdAt: release.createdAt,
      id: release.id,
      release,
      scheduledAt: release.scheduledAt,
      status: normalizedStatus(release.status),
      summary: stripHtml(release.baseContent),
      title: release.title?.trim() || 'Untitled post',
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
      channel: post.platform ?? 'social',
      createdAt: post.createdAt,
      id: post.id,
      status: normalizedStatus(post.status),
      summary: stripHtml(post.description),
      title:
        post.label?.trim() || stripHtml(post.description) || 'Untitled post',
      type: 'post',
    }));

  const articleItems: PublishingContentLibraryItem[] = articles.map(
    (article) => ({
      channel:
        article.category === ArticleCategory.X_ARTICLE
          ? Platform.TWITTER
          : 'web',
      createdAt: article.createdAt,
      id: article.id,
      status: normalizedStatus(article.status),
      summary: stripHtml(article.summary || article.content),
      title: article.label?.trim() || 'Untitled article',
      type: 'article',
    }),
  );

  const newsletterItems: PublishingContentLibraryItem[] = newsletters.map(
    (newsletter) => ({
      channel: 'email',
      createdAt: newsletter.createdAt,
      id: newsletter.id,
      status: normalizedStatus(newsletter.status),
      summary: stripHtml(newsletter.summary || newsletter.topic),
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

export function filterPublishingContentLibraryItems(
  items: PublishingContentLibraryItem[],
  filters: PublishingContentLibraryFilters,
): PublishingContentLibraryItem[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.type !== 'all' && item.type !== filters.type) {
      return false;
    }

    if (
      filters.channel !== 'all' &&
      !(item.channels ?? [item.channel]).includes(filters.channel)
    ) {
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
