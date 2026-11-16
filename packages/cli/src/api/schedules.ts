import type { IReleaseGroup, PostingTimeRecommendation } from '@genfeedai/contracts/interfaces';
import { get, patch, post } from './client';
import { flattenSingle, type JsonApiDocument } from './json-api';

export async function getOptimalTime(
  platform: string,
  timezone?: string
): Promise<PostingTimeRecommendation> {
  return post<PostingTimeRecommendation>('/schedules/optimal', {
    platform,
    ...(timezone ? { timezone } : {}),
  });
}

export async function getScheduledRelease(releaseId: string): Promise<IReleaseGroup> {
  const response = await get<JsonApiDocument>(`/post-groups/${encodeURIComponent(releaseId)}`);
  return flattenSingle<IReleaseGroup>(response);
}

export async function cancelScheduledRelease(releaseId: string): Promise<IReleaseGroup> {
  const response = await patch<JsonApiDocument>(`/post-groups/${encodeURIComponent(releaseId)}`, {
    action: 'cancel',
  });
  return flattenSingle<IReleaseGroup>(response);
}

export async function rescheduleScheduledRelease(
  releaseId: string,
  scheduledDate: string
): Promise<IReleaseGroup> {
  const response = await patch<JsonApiDocument>(`/post-groups/${encodeURIComponent(releaseId)}`, {
    scheduledDate,
  });
  return flattenSingle<IReleaseGroup>(response);
}
