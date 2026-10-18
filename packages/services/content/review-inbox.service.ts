import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  IReviewInboxDecisionRequest,
  IReviewInboxDecisionResult,
  IReviewInboxItem,
  IReviewInboxListQuery,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';

/**
 * Workflow review gates and MCP approvals waiting on a human (#7340). Turbo
 * run drafts stay on {@link TurboRunsService}.
 */
export class ReviewInboxService extends HTTPBaseService {
  constructor(token: string) {
    super(
      `${EnvironmentService.apiEndpoint}${API_ENDPOINTS.REVIEW_INBOX}`,
      token,
    );
  }

  public static getInstance(token: string): ReviewInboxService {
    return HTTPBaseService.getBaseServiceInstance(ReviewInboxService, token);
  }

  /**
   * `brandId` selects the brand the page shows; the API's selected-tenant read
   * scope honours it and falls back to the session brand without it.
   */
  async getPendingItems(
    query: IReviewInboxListQuery,
    signal?: AbortSignal,
  ): Promise<IReviewInboxItem[]> {
    try {
      const response = await this.instance.get<JsonApiResponseDocument>('', {
        params: query,
        signal,
      });
      return deserializeCollection<IReviewInboxItem>(response.data);
    } catch (error) {
      logger.error('GET /review-inbox failed', error);
      throw error;
    }
  }

  async decide(
    request: IReviewInboxDecisionRequest,
  ): Promise<IReviewInboxDecisionResult> {
    try {
      const response = await this.instance.post<JsonApiResponseDocument>(
        '/decisions',
        request,
      );
      return deserializeResource<IReviewInboxDecisionResult>(response.data);
    } catch (error) {
      logger.error('POST /review-inbox/decisions failed', error);
      throw error;
    }
  }
}
