import { type TurboRunItemStatus, TurboRunStatus } from '@genfeedai/contracts';
import { get, patch, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface TurboRun {
  id: string;
  status: TurboRunStatus;
  count: number;
  platforms: string[];
  topics?: string[];
  style?: string;
  startDate?: string;
  endDate?: string;
  completedItems?: number;
  failedItems?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TurboRunItem {
  id: string;
  /**
   * Per-item status inside the run `items` JSON payload — SCREAMING_SNAKE,
   * same as the run itself.
   *
   * @see .agents/memory/rules/enum_source_of_truth.md
   */
  status: TurboRunItemStatus;
  platform?: string;
  contentType?: string;
  title?: string;
  error?: string;
}

export interface TurboRunDetail extends TurboRun {
  items?: TurboRunItem[];
}

export interface CreateTurboRunRequest {
  count: number;
  platforms: string[];
  brandId: string;
  topics?: string[];
  style?: string;
  startDate?: string;
  endDate?: string;
}

export interface TurboRunActionRequest {
  action: 'approve' | 'reject';
  itemIds?: string[];
}

export async function createTurboRun(request: CreateTurboRunRequest): Promise<TurboRun> {
  const response = await post<JsonApiSingleResponse>('/turbo-runs', request);
  return flattenSingle<TurboRun>(response);
}

export async function listTurboRuns(params?: {
  status?: TurboRunStatus;
  limit?: number;
}): Promise<TurboRun[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = qs ? `/turbo-runs?${qs}` : '/turbo-runs';
  const response = await get<JsonApiCollectionResponse>(path);
  return flattenCollection<TurboRun>(response);
}

export async function getTurboRun(id: string): Promise<TurboRunDetail> {
  const response = await get<JsonApiSingleResponse>(`/turbo-runs/${id}`);
  return flattenSingle<TurboRunDetail>(response);
}

export async function turboRunItemAction(
  turboRunId: string,
  request: TurboRunActionRequest
): Promise<void> {
  await post<JsonApiSingleResponse>(`/turbo-runs/${turboRunId}/items/action`, request);
}

export async function cancelTurboRun(turboRunId: string): Promise<void> {
  await patch<JsonApiSingleResponse>(`/turbo-runs/${turboRunId}`, {
    status: TurboRunStatus.CANCELLED,
  });
}
