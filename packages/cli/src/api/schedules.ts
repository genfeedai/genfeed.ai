import { get, post } from './client.js';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api.js';

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

export interface RepurposeResult {
  id: string;
  status: string;
  platforms?: string[];
  createdItems?: number;
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

export async function repurposeContent(
  contentId: string,
  platforms: string[]
): Promise<RepurposeResult> {
  const response = await post<JsonApiSingleResponse>('/schedules/repurpose', {
    contentId,
    platforms,
  });
  return flattenSingle<RepurposeResult>(response);
}

export async function getRepurposeStatus(id: string): Promise<RepurposeResult> {
  const response = await get<JsonApiSingleResponse>(`/schedules/repurpose/${id}`);
  return flattenSingle<RepurposeResult>(response);
}
