import { get, post } from './client';
import { flattenCollection, type JsonApiDocument } from './json-api';

export interface Post {
  id: string;
  title?: string;
  platform?: string;
  status?: string;
  publishedAt?: string;
  scheduledAt?: string;
  engagementRate?: number;
  createdAt: string;
}

export async function listPosts(params?: {
  executionState?: string;
  limit?: number;
  platform?: string;
}): Promise<Post[]> {
  const query = new URLSearchParams();
  if (params?.platform) query.set('platform', params.platform);
  if (params?.executionState) query.set('executionState', params.executionState);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = qs ? `/posts?${qs}` : '/posts';
  const response = await get<JsonApiDocument>(path);
  return flattenCollection<Post>(response);
}

export interface PostRemoval {
  /** True only when the provider confirmed the network copy is gone. */
  deletedOnPlatform: boolean;
  media: {
    deleted: string[];
    kept: { id: string; reason: 'not-editable' | 'used-by-another-post' }[];
  };
  platform: string | null;
  platformDeletion: 'deleted' | 'not-published' | 'not-requested';
  postId: string;
  previousStatus: string;
  publishedUrl: string | null;
  verified: { mediaGone: boolean; postGone: boolean };
}

/**
 * Deletes a post, with `includeMedia` the Library media only it uses, and with
 * `deleteOnPlatform` the post on its social network first (X and Mastodon).
 */
export async function deletePost(
  id: string,
  options: { deleteOnPlatform?: boolean; includeMedia?: boolean } = {}
): Promise<PostRemoval> {
  return await post<PostRemoval>(`/posts/${encodeURIComponent(id)}/deletions`, {
    deleteOnPlatform: options.deleteOnPlatform === true,
    includeMedia: options.includeMedia === true,
  });
}
