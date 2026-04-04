import { Evaluation } from '@genfeedai/client/models';
import { EvaluationSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import type { EvaluationType, IngredientCategory } from '@genfeedai/enums';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export interface EvaluateContentRequest {
  evaluationType?: EvaluationType;
}

export interface EvaluationTrendsFilters {
  brand?: string;
  startDate?: string;
  endDate?: string;
  contentType?: IngredientCategory | 'article' | 'post';
  evaluationType?: EvaluationType;
  minScore?: string;
  maxScore?: string;
}

export class EvaluationsService extends BaseService<Evaluation> {
  constructor(token: string) {
    super(API_ENDPOINTS.EVALUATIONS, token, Evaluation, EvaluationSerializer);
  }

  public static getInstance(token: string): EvaluationsService {
    return BaseService.getDataServiceInstance(
      EvaluationsService,
      token,
    ) as EvaluationsService;
  }

  /**
   * Evaluate an image
   * POST /evaluations/images/:id
   * Cost: 1 credit
   */
  public async evaluateImage(
    imageId: string,
    options?: EvaluateContentRequest,
  ): Promise<Evaluation> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/images/${imageId}`, options || {})
      .then((res) => res.data)
      .then((data) => this.mapOne(data));
  }

  /**
   * Evaluate a video
   * POST /evaluations/videos/:id
   * Cost: 1 credit
   */
  public async evaluateVideo(
    videoId: string,
    options?: EvaluateContentRequest,
  ): Promise<Evaluation> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/videos/${videoId}`, options || {})
      .then((res) => res.data)
      .then((data) => this.mapOne(data));
  }

  /**
   * Evaluate an article
   * POST /evaluations/articles/:id
   * Cost: 1 credit
   */
  public async evaluateArticle(
    articleId: string,
    options?: EvaluateContentRequest,
  ): Promise<Evaluation> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/articles/${articleId}`, options || {})
      .then((res) => res.data)
      .then((data) => this.mapOne(data));
  }

  /**
   * Evaluate a post/thread
   * POST /evaluations/posts/:id
   * Cost: 1 credit
   */
  public async evaluatePost(
    postId: string,
    options?: EvaluateContentRequest,
  ): Promise<Evaluation> {
    return await this.instance
      .post<JsonApiResponseDocument>(`/posts/${postId}`, options || {})
      .then((res) => res.data)
      .then((data) => this.mapOne(data));
  }

  /**
   * Get evaluations for an image
   * GET /evaluations/images/:id
   */
  public async getImageEvaluations(imageId: string): Promise<Evaluation[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/images/${imageId}`)
      .then((res) => res.data)
      .then((data) => this.mapMany(data));
  }

  /**
   * Get evaluations for a video
   * GET /evaluations/videos/:id
   */
  public async getVideoEvaluations(videoId: string): Promise<Evaluation[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/videos/${videoId}`)
      .then((res) => res.data)
      .then((data) => this.mapMany(data));
  }

  /**
   * Get evaluations for an article
   * GET /evaluations/articles/:id
   */
  public async getArticleEvaluations(articleId: string): Promise<Evaluation[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/articles/${articleId}`)
      .then((res) => res.data)
      .then((data) => this.mapMany(data));
  }

  /**
   * Get evaluations for a post
   * GET /evaluations/posts/:id
   */
  public async getPostEvaluations(postId: string): Promise<Evaluation[]> {
    return await this.instance
      .get<JsonApiResponseDocument>(`/posts/${postId}`)
      .then((res) => res.data)
      .then((data) => this.mapMany(data));
  }

  /**
   * Get evaluation trends and analytics
   */
  public async getTrends(filters?: EvaluationTrendsFilters): Promise<unknown> {
    return await this.instance
      .get('analytics/trends', { params: filters })
      .then((res) => res.data);
  }

  /**
   * Delete an evaluation
   */
  public async deleteEvaluation(evaluationId: string): Promise<void> {
    await this.instance.delete(evaluationId);
  }
}
