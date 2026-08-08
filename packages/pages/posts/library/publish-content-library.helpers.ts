import {
  ArticleCategory,
  formatPlatformLabel,
  Platform,
} from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';

export const PUBLISH_CONTENT_TYPES = ['post', 'article', 'newsletter'] as const;

export type PublishContentType = (typeof PUBLISH_CONTENT_TYPES)[number];
export type PublishContentTypeFilter = PublishContentType | 'all';

export interface PublishContentLibraryItem {
  channel: string;
  createdAt: string;
  id: string;
  status: string;
  summary: string;
  title: string;
  type: PublishContentType;
}

export interface PublishContentLibraryFilters {
  channel: string;
  search: string;
  status: string;
  type: PublishContentTypeFilter;
}

function stripHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedStatus(status?: string): string {
  return status?.trim().toLowerCase() || 'draft';
}

function newestFirst(
  left: PublishContentLibraryItem,
  right: PublishContentLibraryItem,
): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

export function formatPublishContentType(type: PublishContentType): string {
  switch (type) {
    case 'article':
      return 'Article';
    case 'newsletter':
      return 'Newsletter';
    case 'post':
      return 'Post';
  }
}

export function formatPublishContentStatus(status: string): string {
  return status
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function formatPublishContentChannel(channel: string): string {
  switch (channel) {
    case 'email':
      return 'Email';
    case 'social':
      return 'Social';
    case 'web':
      return 'Website';
    default:
      return (
        formatPlatformLabel(channel) ?? formatPublishContentStatus(channel)
      );
  }
}

export function createPublishContentLibraryItems({
  articles,
  newsletters,
  posts,
}: {
  articles: Article[];
  newsletters: Newsletter[];
  posts: IPost[];
}): PublishContentLibraryItem[] {
  const postItems: PublishContentLibraryItem[] = posts.map((post) => ({
    channel: post.platform ?? 'social',
    createdAt: post.createdAt,
    id: post.id,
    status: normalizedStatus(post.status),
    summary: stripHtml(post.description),
    title: post.label?.trim() || stripHtml(post.description) || 'Untitled post',
    type: 'post',
  }));

  const articleItems: PublishContentLibraryItem[] = articles.map((article) => ({
    channel:
      article.category === ArticleCategory.X_ARTICLE ? Platform.TWITTER : 'web',
    createdAt: article.createdAt,
    id: article.id,
    status: normalizedStatus(article.status),
    summary: stripHtml(article.summary || article.content),
    title: article.label?.trim() || 'Untitled article',
    type: 'article',
  }));

  const newsletterItems: PublishContentLibraryItem[] = newsletters.map(
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

  return [...postItems, ...articleItems, ...newsletterItems].sort(newestFirst);
}

export function filterPublishContentLibraryItems(
  items: PublishContentLibraryItem[],
  filters: PublishContentLibraryFilters,
): PublishContentLibraryItem[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.type !== 'all' && item.type !== filters.type) {
      return false;
    }

    if (filters.channel !== 'all' && item.channel !== filters.channel) {
      return false;
    }

    if (filters.status !== 'all' && item.status !== filters.status) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.title,
      item.summary,
      formatPublishContentType(item.type),
      formatPublishContentChannel(item.channel),
      formatPublishContentStatus(item.status),
    ].some((value) => value.toLowerCase().includes(normalizedSearch));
  });
}

export function parsePublishContentType(
  value: string | null,
): PublishContentTypeFilter {
  return value && PUBLISH_CONTENT_TYPES.includes(value as PublishContentType)
    ? (value as PublishContentType)
    : 'all';
}
