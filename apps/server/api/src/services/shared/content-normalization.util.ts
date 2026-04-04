/**
 * Content Normalization Utilities
 *
 * Shared helpers for normalizing content from various social media platforms.
 * Used by Apify service and other integrations.
 */

/**
 * Base video data that all platforms must provide
 */
export interface BaseVideoData {
  externalId: string;
  title?: string;
  description?: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  publishedAt?: Date;
  creatorHandle: string;
  creatorId?: string;
  platform: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Base comment data that all platforms must provide
 */
export interface BaseCommentData {
  id: string;
  text: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  createdAt: Date;
  likes: number;
  replies: number;
}

/**
 * Field extractor function type - maps raw data to normalized field
 */
type FieldExtractor<T, R> = (raw: T) => R;

/**
 * Field mapping for video normalization
 */
export interface VideoFieldMapping<T> {
  externalId: FieldExtractor<T, string>;
  title?: FieldExtractor<T, string | undefined>;
  description?: FieldExtractor<T, string | undefined>;
  viewCount: FieldExtractor<T, number>;
  likeCount: FieldExtractor<T, number>;
  commentCount: FieldExtractor<T, number>;
  shareCount: FieldExtractor<T, number>;
  publishedAt?: FieldExtractor<T, Date | undefined>;
  creatorHandle: FieldExtractor<T, string>;
  creatorId?: FieldExtractor<T, string | undefined>;
  videoUrl?: FieldExtractor<T, string | undefined>;
  thumbnailUrl?: FieldExtractor<T, string | undefined>;
}

/**
 * Field mapping for comment normalization
 */
export interface CommentFieldMapping<T> {
  id: FieldExtractor<T, string>;
  text: FieldExtractor<T, string>;
  authorId: FieldExtractor<T, string>;
  authorUsername: FieldExtractor<T, string>;
  authorAvatarUrl?: FieldExtractor<T, string | undefined>;
  createdAt: FieldExtractor<T, Date>;
  likes: FieldExtractor<T, number>;
  replies: FieldExtractor<T, number>;
}

/**
 * Normalize videos using field mapping
 */
export function normalizeVideos<T>(
  rawVideos: T[],
  mapping: VideoFieldMapping<T>,
  platform: string,
): BaseVideoData[] {
  return rawVideos.map((raw) => ({
    commentCount: mapping.commentCount(raw),
    creatorHandle: mapping.creatorHandle(raw),
    creatorId: mapping.creatorId?.(raw),
    description: mapping.description?.(raw),
    externalId: mapping.externalId(raw),
    likeCount: mapping.likeCount(raw),
    platform,
    publishedAt: mapping.publishedAt?.(raw),
    shareCount: mapping.shareCount(raw),
    thumbnailUrl: mapping.thumbnailUrl?.(raw),
    title: mapping.title?.(raw),
    videoUrl: mapping.videoUrl?.(raw),
    viewCount: mapping.viewCount(raw),
  }));
}

/**
 * Normalize comments using field mapping
 */
export function normalizeComments<T>(
  rawComments: T[],
  mapping: CommentFieldMapping<T>,
): BaseCommentData[] {
  return rawComments.map((raw) => ({
    authorAvatarUrl: mapping.authorAvatarUrl?.(raw),
    authorId: mapping.authorId(raw),
    authorUsername: mapping.authorUsername(raw),
    createdAt: mapping.createdAt(raw),
    id: mapping.id(raw),
    likes: mapping.likes(raw),
    replies: mapping.replies(raw),
    text: mapping.text(raw),
  }));
}

/**
 * Common field extractors for typical patterns
 */
export const CommonExtractors = {
  /**
   * Parse ISO string to Date
   */
  isoToDate: (isoString: string | undefined): Date | undefined =>
    isoString ? new Date(isoString) : undefined,

  /**
   * Safe number extraction
   */
  safeNumber: (value: number | undefined | null): number => value ?? 0,

  /**
   * Safe string extraction
   */
  safeString: (value: string | undefined | null): string => value ?? '',

  /**
   * Truncate string to max length
   */
  truncate:
    (maxLength: number) =>
    (value: string | undefined): string =>
      value?.substring(0, maxLength) ?? '',
  /**
   * Parse Unix timestamp to Date
   */
  unixToDate: (timestamp: number | undefined): Date | undefined =>
    timestamp ? new Date(timestamp * 1000) : undefined,
};
