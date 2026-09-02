import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { get, patch, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

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

export interface OptimalTime {
  platform: string;
  day: string;
  hour: number;
  timezone: string;
  score: number;
}

export async function getCalendar(start?: string, end?: string): Promise<ScheduleEntry[]> {
  const query = new URLSearchParams();
  if (start) query.set('start', start);
  if (end) query.set('end', end);
  const qs = query.toString();
  const path = qs ? `/schedules/calendar?${qs}` : '/schedules/calendar';
  const response = await get<JsonApiCollectionResponse>(path);
  return flattenCollection<ScheduleEntry>(response);
}

export async function bulkSchedule(items: BulkScheduleItem[]): Promise<ScheduleEntry[]> {
  const response = await post<JsonApiCollectionResponse>('/schedules/bulk', {
    items,
  });
  return flattenCollection<ScheduleEntry>(response);
}

export async function getOptimalTimes(
  platform?: string,
  timezone?: string
): Promise<OptimalTime[]> {
  const body: Record<string, unknown> = {};
  if (platform) body.platform = platform;
  if (timezone) body.timezone = timezone;
  const response = await post<JsonApiCollectionResponse>('/schedules/optimal', body);
  return flattenCollection<OptimalTime>(response);
}

export async function getScheduledRelease(releaseId: string): Promise<IReleaseGroup> {
  const response = await get<JsonApiSingleResponse>(
    `/post-groups/${encodeURIComponent(releaseId)}`
  );
  return flattenSingle<IReleaseGroup>(response);
}

export async function cancelScheduledRelease(releaseId: string): Promise<IReleaseGroup> {
  const response = await patch<JsonApiSingleResponse>(
    `/post-groups/${encodeURIComponent(releaseId)}`,
    { action: 'cancel' }
  );
  return flattenSingle<IReleaseGroup>(response);
}

export async function rescheduleScheduledRelease(
  releaseId: string,
  scheduledDate: string
): Promise<IReleaseGroup> {
  const response = await patch<JsonApiSingleResponse>(
    `/post-groups/${encodeURIComponent(releaseId)}`,
    { scheduledDate }
  );
  return flattenSingle<IReleaseGroup>(response);
}
