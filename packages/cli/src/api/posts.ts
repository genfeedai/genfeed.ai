import { get } from './client';
import { flattenCollection, type JsonApiCollectionResponse } from './json-api';

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
  const response = await get<JsonApiCollectionResponse>(path);
  return flattenCollection<Post>(response);
}
