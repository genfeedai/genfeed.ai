import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { Task } from '@services/management/tasks.service';

export interface RequestIngredientReviewInput {
  note?: string;
  reviewerUserIds: string[];
}

interface ReviewerCandidatesResponse {
  reviewerUserIds: string[];
}

/**
 * Teammate reviews of a Library asset (#9945). A review request is a review
 * task with the reviewer as assignee; the reviewer decides it through the
 * tasks service (`approve`, `requestChanges`).
 */
export class IngredientReviewRequestsService extends BaseService<
  Task,
  RequestIngredientReviewInput,
  Partial<RequestIngredientReviewInput>
> {
  constructor(token: string) {
    super('/ingredients', token, Task);
  }

  public static getInstance(token: string): IngredientReviewRequestsService {
    return BaseService.getDataServiceInstance(
      IngredientReviewRequestsService,
      token,
    );
  }

  /** The review requests on an asset the caller may see. */
  async listForIngredient(
    ingredientId: string,
    signal?: AbortSignal,
  ): Promise<Task[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${ingredientId}/review-requests`,
      this.instance
        .get<JsonApiResponseDocument>(`/${ingredientId}/review-requests`, {
          signal,
        })
        .then((response) => this.mapMany(response.data)),
    );
  }

  /** The teammates who reach the asset's brand and can be asked to review. */
  async listCandidates(
    ingredientId: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return this.executeWithErrorHandling(
      `GET ${this.baseURL}/${ingredientId}/review-requests/candidates`,
      this.instance
        .get<ReviewerCandidatesResponse>(
          `/${ingredientId}/review-requests/candidates`,
          { signal },
        )
        .then((response) => response.data.reviewerUserIds),
    );
  }

  /** Asks the reviewers; one review task and thread is created for each. */
  async request(
    ingredientId: string,
    input: RequestIngredientReviewInput,
  ): Promise<Task[]> {
    return this.executeWithErrorHandling(
      `POST ${this.baseURL}/${ingredientId}/review-requests`,
      this.instance
        .post<JsonApiResponseDocument>(
          `/${ingredientId}/review-requests`,
          input,
        )
        .then((response) => this.mapMany(response.data)),
    );
  }
}
