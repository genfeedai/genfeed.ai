import { type BatchItemStatus, BatchStatus } from '@genfeedai/contracts';
import { get, patch, post } from './client';
import {
  flattenCollection,
  flattenSingle,
  type JsonApiCollectionResponse,
  type JsonApiSingleResponse,
} from './json-api';

export interface Batch {
  id: string;
  status: BatchStatus;
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

export interface BatchItem {
  id: string;
  /**
   * Per-item status inside the batch `items` JSON payload — SCREAMING_SNAKE,
   * same as the batch itself.
   *
   * @see .agents/memory/rules/enum_source_of_truth.md
   */
  status: BatchItemStatus;
  platform?: string;
  contentType?: string;
  title?: string;
  error?: string;
}

export interface BatchDetail extends Batch {
  items?: BatchItem[];
}

export interface CreateBatchRequest {
  count: number;
  platforms: string[];
  brandId: string;
  topics?: string[];
  style?: string;
  startDate?: string;
  endDate?: string;
}

export interface BatchActionRequest {
  action: 'approve' | 'reject';
  itemIds?: string[];
}

export async function createBatch(request: CreateBatchRequest): Promise<Batch> {
  const response = await post<JsonApiSingleResponse>(
    '/batches',
    request as unknown as Record<string, unknown>
  );
  return flattenSingle<Batch>(response);
}

export async function listBatches(params?: {
  status?: BatchStatus;
  limit?: number;
}): Promise<Batch[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const path = qs ? `/batches?${qs}` : '/batches';
  const response = await get<JsonApiCollectionResponse>(path);
  return flattenCollection<Batch>(response);
}

export async function getBatch(id: string): Promise<BatchDetail> {
  const response = await get<JsonApiSingleResponse>(`/batches/${id}`);
  return flattenSingle<BatchDetail>(response);
}

export async function batchItemAction(batchId: string, request: BatchActionRequest): Promise<void> {
  await post<JsonApiSingleResponse>(
    `/batches/${batchId}/items/action`,
    request as unknown as Record<string, unknown>
  );
}

export async function cancelBatch(batchId: string): Promise<void> {
  await patch<JsonApiSingleResponse>(`/batches/${batchId}`, {
    status: BatchStatus.CANCELLED,
  });
}
