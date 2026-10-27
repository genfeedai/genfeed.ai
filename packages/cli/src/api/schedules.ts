import type { IReleaseGroup, PostingTimeRecommendation } from '@genfeedai/contracts/interfaces';
import { get, patch, post } from './client';
import { flattenCollection, flattenSingle, type JsonApiDocument } from './json-api';

export interface ScheduleEntry {
  id: string;
  contentId?: string;
  platform?: string;
  scheduledAt: string;
  status?: string;
  title?: string;
}

export interface BulkScheduleItem {
  contentId: string;
  platform: string;
  scheduledAt: string;
}

export async function getCalendar(start?: string, end?: string): Promise<ScheduleEntry[]> {
  const query = new URLSearchParams();
  if (start) query.set('start', start);
  if (end) query.set('end', end);
  const qs = query.toString();
  const path = qs ? `/schedules/calendar?${qs}` : '/schedules/calendar';
  const response = await get<JsonApiDocument>(path);
  return flattenCollection<ScheduleEntry>(response);
}

export async function bulkSchedule(items: BulkScheduleItem[]): Promise<ScheduleEntry[]> {
  const response = await post<JsonApiDocument>('/schedules/bulk', {
    items,
  });
  return flattenCollection<ScheduleEntry>(response);
}

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
