import { get } from './client.js';
import { flattenCollection, type JsonApiCollectionResponse } from './json-api.js';

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
  limit?: number;
  platform?: string;
  status?: string;
}): Promise<Post[]> {
  const query = new URLSearchParams();
  if (params?.platform) query.set('platform', params.platform);
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = qs ? `/posts?${qs}` : '/posts';
  const response = await get<JsonApiCollectionResponse>(path);
  return flattenCollection<Post>(response);
}
