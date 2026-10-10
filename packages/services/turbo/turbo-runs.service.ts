import { TurboRunStatus } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  ITurboRewriteJob,
  ITurboRunSummary,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';

export interface TurboRunListQuery {
  status?: TurboRunStatus;
  limit?: number;
  offset?: number;
}

export interface TurboRunActionRequest {
  action: 'approve' | 'reject' | 'request_changes';
  feedback?: string;
  itemIds: string[];
}

export interface CreateManualReviewTurboRunRequest {
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

export class TurboRunsService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}${API_ENDPOINTS.TURBO_RUNS}`, token);
  }

  public static getInstance(token: string): TurboRunsService {
    return HTTPBaseService.getBaseServiceInstance(TurboRunsService, token);
  }

  async getTurboRuns(query?: TurboRunListQuery): Promise<ITurboRunSummary[]> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params: query,
      });
      return deserializeCollection<ITurboRunSummary>(response.data);
    } catch (error) {
      const status = getJsonApiErrorMember(error)?.status;
      if (status === 403) {
        logger.warn('GET /batches denied', { status });
      } else {
        logger.error('GET /batches failed', error);
      }
      throw error;
    }
  }

  async createManualReviewTurboRun(
    request: CreateManualReviewTurboRunRequest,
  ): Promise<ITurboRunSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        '/manual-review',
        request,
      );
      return deserializeResource<ITurboRunSummary>(response.data);
    } catch (error) {
      logger.error('POST /turbo-runs/manual-review failed', error);
      throw error;
    }
  }

  async getTurboRun(id: string): Promise<ITurboRunSummary> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>(
        `/${id}`,
      );
      return deserializeResource<ITurboRunSummary>(response.data);
    } catch (error) {
      logger.error(`GET /turbo-runs/${id} failed`, error);
      throw error;
    }
  }

  async itemAction(
    turboRunId: string,
    request: TurboRunActionRequest,
  ): Promise<ITurboRunSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${turboRunId}/items/action`,
        request,
      );
      return deserializeResource<ITurboRunSummary>(response.data);
    } catch (error) {
      logger.error(`POST /turbo-runs/${turboRunId}/items/action failed`, error);
      throw error;
    }
  }

  /** Queues the rewrite and returns at once; progress arrives over the socket. */
  async createRewriteJob(
    turboRunId: string,
    itemIds: string[],
  ): Promise<ITurboRewriteJob> {
    try {
      const response = await this.instance.post<ITurboRewriteJob>(
        `/${turboRunId}/rewrite-jobs`,
        { itemIds },
      );
      return response.data;
    } catch (error) {
      logger.error(`POST /turbo-runs/${turboRunId}/rewrite-jobs failed`, error);
      throw error;
    }
  }

  async getActiveRewriteJob(
    turboRunId: string,
    signal?: AbortSignal,
  ): Promise<ITurboRewriteJob | null> {
    try {
      const response = await this.instance.get<{
        job: ITurboRewriteJob | null;
      }>(`/${turboRunId}/rewrite-jobs/active`, { signal });
      return response.data.job;
    } catch (error) {
      logger.error(`GET /turbo-runs/${turboRunId}/rewrite-jobs/active failed`, error);
      throw error;
    }
  }

  async getRewriteJob(
    turboRunId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<ITurboRewriteJob> {
    try {
      const response = await this.instance.get<ITurboRewriteJob>(
        `/${turboRunId}/rewrite-jobs/${jobId}`,
        { signal },
      );
      return response.data;
    } catch (error) {
      logger.error(
        `GET /turbo-runs/${turboRunId}/rewrite-jobs/${jobId} failed`,
        error,
      );
      throw error;
    }
  }

  async cancelRewriteJob(
    turboRunId: string,
    jobId: string,
  ): Promise<ITurboRewriteJob> {
    try {
      const response = await this.instance.post<ITurboRewriteJob>(
        `/${turboRunId}/rewrite-jobs/${jobId}/cancel`,
      );
      return response.data;
    } catch (error) {
      logger.error(
        `POST /turbo-runs/${turboRunId}/rewrite-jobs/${jobId}/cancel failed`,
        error,
      );
      throw error;
    }
  }

  async assignItem(
    turboRunId: string,
    itemId: string,
    assigneeId: string,
  ): Promise<ITurboRunSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${turboRunId}/items/${itemId}/assign`,
        { assigneeId },
      );
      return deserializeResource<ITurboRunSummary>(response.data);
    } catch (error) {
      logger.error(
        `POST /turbo-runs/${turboRunId}/items/${itemId}/assign failed`,
        error,
      );
      throw error;
    }
  }

  async unassignItem(turboRunId: string, itemId: string): Promise<ITurboRunSummary> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        `/${turboRunId}/items/${itemId}/unassign`,
      );
      return deserializeResource<ITurboRunSummary>(response.data);
    } catch (error) {
      logger.error(
        `POST /turbo-runs/${turboRunId}/items/${itemId}/unassign failed`,
        error,
      );
      throw error;
    }
  }

  async cancelTurboRun(id: string): Promise<ITurboRunSummary> {
    try {
      const response = await this.instance.patch<JsonApiResponseDocument>(
        `/${id}`,
        { status: TurboRunStatus.CANCELLED },
      );
      return deserializeResource<ITurboRunSummary>(response.data);
    } catch (error) {
      logger.error(`PATCH /turbo-runs/${id} (cancel) failed`, error);
      throw error;
    }
  }
}
