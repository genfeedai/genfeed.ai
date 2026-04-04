/**
 * Shared content type labels used across approval screens
 */

export type ContentType = 'image' | 'video' | 'article' | 'post';

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  article: 'Article',
  image: 'Image',
  post: 'Post',
  video: 'Video',
};
