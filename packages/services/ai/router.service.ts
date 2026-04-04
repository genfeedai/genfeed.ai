import { ModelCategory } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

export interface SelectModelRequest {
  prompt: string;
  category: ModelCategory;
  prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';
  dimensions?: {
    width?: number;
    height?: number;
  };
  duration?: number;
  speech?: string;
  outputs?: number;
}

export interface PromptAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  keywords: string[];
  hasSpecificStyle: boolean;
  hasQualityIndicators: boolean;
  hasSpeedIndicators: boolean;
  estimatedLength: number;
  detectedFeatures: string[];
}

export interface ModelRecommendation {
  selectedModel: string;
  reason: string;
  modelDetails: {
    id: string;
    key: string;
    provider: string;
    category: string;
    cost: number;
  };
  alternatives: Array<{
    model: string;
    reason: string;
    score: number;
  }>;
  analysis: PromptAnalysis;
}

/**
 * RouterService - Intelligent model selection for content generation
 *
 * Automatically selects the best AI model based on prompt analysis
 * Uses rule-based routing (no LLM calls) for fast, cost-effective selection
 *
 * @example
 * ```typescript
 * const routerService = RouterService.getInstance(token);
 * const recommendation = await routerService.selectModel({
 *   prompt: "A professional portrait in natural lighting",
 *   category: ModelCategory.IMAGE,
 *   prioritize: "quality"
 * });
 * console.log(recommendation.selectedModel); // "google/imagen-4"
 * ```
 */
export class RouterService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/router`, token);
  }

  static getInstance(token: string): RouterService {
    return HTTPBaseService.getBaseServiceInstance(
      RouterService,
      token,
    ) as RouterService;
  }

  static clearInstance(): void {
    HTTPBaseService.clearInstance.call(RouterService);
  }

  /**
   * Select the optimal model for content generation
   *
   * @param request - Selection parameters
   * @returns Model recommendation with reasoning and alternatives
   *
   * @example
   * ```typescript
   * // For images
   * const imageRecommendation = await routerService.selectModel({
   *   prompt: "A futuristic city at sunset",
   *   category: ModelCategory.IMAGE,
   *   prioritize: "balanced",
   *   dimensions: { width: 1920, height: 1080 }
   * });
   *
   * // For videos
   * const videoRecommendation = await routerService.selectModel({
   *   prompt: "A cinematic video of mountains",
   *   category: ModelCategory.VIDEO,
   *   duration: 30,
   *   prioritize: "quality"
   * });
   *
   * // For videos with speech
   * const speechVideoRecommendation = await routerService.selectModel({
   *   prompt: "Explaining quantum physics",
   *   category: ModelCategory.VIDEO,
   *   speech: "Quantum physics is fascinating..."
   * });
   * ```
   */
  async selectModel(request: SelectModelRequest): Promise<ModelRecommendation> {
    return await this.instance
      .post<ModelRecommendation>('/select-model', request)
      .then((res) => res.data)
      .then((data) => data);
  }

  /**
   * Convenience method for image generation
   */
  async selectImageModel(
    prompt: string,
    options?: {
      prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';
      width?: number;
      height?: number;
      outputs?: number;
    },
  ): Promise<ModelRecommendation> {
    return this.selectModel({
      category: ModelCategory.IMAGE,
      dimensions: {
        height: options?.height,
        width: options?.width,
      },
      outputs: options?.outputs,
      prioritize: options?.prioritize,
      prompt,
    });
  }

  /**
   * Convenience method for video generation
   */
  async selectVideoModel(
    prompt: string,
    options?: {
      prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';
      duration?: number;
      speech?: string;
      width?: number;
      height?: number;
      outputs?: number;
    },
  ): Promise<ModelRecommendation> {
    return this.selectModel({
      category: ModelCategory.VIDEO,
      dimensions: {
        height: options?.height,
        width: options?.width,
      },
      duration: options?.duration,
      outputs: options?.outputs,
      prioritize: options?.prioritize,
      prompt,
      speech: options?.speech,
    });
  }

  /**
   * Convenience method for article/text generation
   */
  async selectTextModel(
    prompt: string,
    options?: {
      prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';
    },
  ): Promise<ModelRecommendation> {
    return this.selectModel({
      category: ModelCategory.TEXT,
      prioritize: options?.prioritize,
      prompt,
    });
  }
}
