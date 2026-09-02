import { BatchStatus } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type { IBatchSummary } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';

export interface BatchListQuery {
  status?: BatchStatus;
  limit?: number;
  offset?: number;
}

export interface BatchActionRequest {
  action: 'approve' | 'reject' | 'request_changes';
  feedback?: string;
  itemIds: string[];
}

export interface CreateManualReviewBatchRequest {
  brandId: string;
  items: Array<{
    caption?: string;
    format: string;
    ingredientId?: string;
    label?: string;
    mediaUrl?: string;
    platform?: string;
    prompt?: string;
    sourceActionId?: string;
    sourceWorkflowId?: string;
    sourceWorkflowName?: string;
  }>;
}

export class BatchesService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.BATCHES}`, token);
  }

  public static getInstance(token: string): BatchesService {
    return HTTPBaseService.getBaseServiceInstance(BatchesService, token);
  }

  async getBatches(query?: BatchListQuery): Promise<IBatchSummary[]> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params: query,
      });
      return deserializeCollection<IBatchSummary>(response.data);
    } catch (error) {
      logger.error('GET /batches failed', error);
      throw error;
    }
  }

  async createManualReviewBatch(
    request: CreateManualReviewBatchRequest,
  ): Promise<IBatchSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        '/manual-review',
        request,
      );
      return deserializeResource<IBatchSummary>(response.data);
    } catch (error) {
      logger.error('POST /batches/manual-review failed', error);
      throw error;
    }
  }

  async getBatch(id: string): Promise<IBatchSummary> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>(
        `/${id}`,
      );
      return deserializeResource<IBatchSummary>(response.data);
    } catch (error) {
      logger.error(`GET /batches/${id} failed`, error);
      throw error;
    }
  }

  async itemAction(
    batchId: string,
    request: BatchActionRequest,
  ): Promise<IBatchSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${batchId}/items/action`,
        request,
      );
      return deserializeResource<IBatchSummary>(response.data);
    } catch (error) {
      logger.error(`POST /batches/${batchId}/items/action failed`, error);
      throw error;
    }
  }

  async assignItem(
    batchId: string,
    itemId: string,
    assigneeId: string,
  ): Promise<IBatchSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${batchId}/items/${itemId}/assign`,
        { assigneeId },
      );
      return deserializeResource<IBatchSummary>(response.data);
    } catch (error) {
      logger.error(
        `POST /batches/${batchId}/items/${itemId}/assign failed`,
        error,
      );
      throw error;
    }
  }

  async unassignItem(batchId: string, itemId: string): Promise<IBatchSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${batchId}/items/${itemId}/unassign`,
      );
      return deserializeResource<IBatchSummary>(response.data);
    } catch (error) {
      logger.error(
        `POST /batches/${batchId}/items/${itemId}/unassign failed`,
        error,
      );
      throw error;
    }
  }

  async cancelBatch(id: string): Promise<IBatchSummary> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        { status: BatchStatus.CANCELLED },
      );
      return deserializeResource<IBatchSummary>(response.data);
    } catch (error) {
      logger.error(`PATCH /batches/${id} (cancel) failed`, error);
      throw error;
    }
  }
}
