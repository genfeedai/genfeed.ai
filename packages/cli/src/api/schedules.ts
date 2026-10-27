import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
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
  const response = await get<JsonApiDocument>(path);
  return flattenCollection<ScheduleEntry>(response);
}

export interface BulkScheduleFailure {
  contentId: string;
  reason: string;
}

export interface BulkScheduleResult {
  scheduled: ScheduleEntry[];
  failed: BulkScheduleFailure[];
}

/** The API refuses more content ids than this in one bulk request. */
const BULK_SCHEDULE_BATCH_SIZE = 100;

/**
 * Schedules each item at its own time. The endpoint takes one platform and one
 * brand per request and, for the `custom` strategy, a `contentId -> time` map,
 * so items are grouped by platform and sent in batches. A batch that fails is
 * reported against its content ids; if nothing was scheduled at all the first
 * error is thrown, so a bad key or brand is not buried in a list.
 */
export async function bulkSchedule(
  brandId: string,
  items: BulkScheduleItem[]
): Promise<BulkScheduleResult> {
  const byPlatform = new Map<string, BulkScheduleItem[]>();
  for (const item of items) {
    byPlatform.set(item.platform, [...(byPlatform.get(item.platform) ?? []), item]);
  }

  const result: BulkScheduleResult = { failed: [], scheduled: [] };
  let firstError: unknown;

  for (const [platform, platformItems] of byPlatform) {
    for (let start = 0; start < platformItems.length; start += BULK_SCHEDULE_BATCH_SIZE) {
      const batch = platformItems.slice(start, start + BULK_SCHEDULE_BATCH_SIZE);
      try {
        const response = await post<BulkScheduleResult>('/schedules/bulk', {
          brandIds: [brandId],
          contentIds: batch.map((item) => item.contentId),
          customTimes: Object.fromEntries(batch.map((item) => [item.contentId, item.scheduledAt])),
          platforms: [platform],
          schedulingStrategy: 'custom',
        });
        result.scheduled.push(...response.scheduled);
        result.failed.push(...response.failed);
      } catch (error) {
        firstError ??= error;
        const reason = error instanceof Error ? error.message : 'Request failed';
        result.failed.push(...batch.map((item) => ({ contentId: item.contentId, reason })));
      }
    }
  }

  if (result.scheduled.length === 0 && firstError !== undefined) {
    throw firstError;
  }
  return result;
}

export async function getOptimalTimes(
  platform?: string,
  timezone?: string
): Promise<OptimalTime[]> {
  const body: Record<string, unknown> = {};
  if (platform) body.platform = platform;
  if (timezone) body.timezone = timezone;
  const response = await post<JsonApiDocument>('/schedules/optimal', body);
  return flattenCollection<OptimalTime>(response);
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
