/**
 * Optimizers Service
 * AI-powered content optimization: analyze quality, score content (0-100),
 * suggest improvements, generate hashtags, create A/B variants, and get best posting times.
 * Backend: /optimizers API
 */

import { deserializeCollection } from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';

export interface IContentScore {
  overall: number;
  breakdown: {
    readability: number;
    engagement: number;
    seo: number;
    viralPotential: number;
    brandConsistency: number;
  };
  suggestions: IOptimizationSuggestion[];
}

export interface IOptimizationSuggestion {
  type: 'improvement' | 'warning' | 'critical';
  category:
    | 'readability'
    | 'engagement'
    | 'seo'
    | 'style'
    | 'tone'
    | 'hashtags';
  message: string;
  originalText?: string;
  suggestedText?: string;
  impact: 'high' | 'medium' | 'low';
}

export interface IHashtagOptimization {
  suggested: string[];
  trending: string[];
  optimal: string[];
  score: number;
  reasoning: string[];
}

export interface IBestTimeToPost {
  platform: string;
  recommendedTimes: Array<{
    day: string;
    time: string;
    confidence: number;
    reason: string;
  }>;
}

export interface IContentVariant {
  id: string;
  variant: string;
  content: string;
  targetAudience?: string;
  estimatedPerformance: number;
  differences: string[];
}

export interface IContentOptimizationRequest {
  content: string;
  type: 'caption' | 'video-script' | 'article' | 'post';
  platform?: string;
  targetAudience?: string;
  brandVoice?: string;
  goals?: string[];
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type DeserializeMode = 'collection' | 'none';

class ContentOptimizerServiceClass {
  private baseURL: string;
  private token: string;

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL;
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    method: HttpMethod,
    body?: unknown,
    errorMessage?: string,
    deserialize: DeserializeMode = 'none',
  ): Promise<T> {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      method,
    });

    if (!response.ok) {
      const error = new Error(errorMessage || `Request failed: ${endpoint}`);
      logger.error(errorMessage || 'Request failed', { endpoint, error });
      throw error;
    }

    const json = await response.json();

    if (deserialize === 'collection') {
      return deserializeCollection(json) as T;
    }

    return json;
  }

  async analyzeContent(
    request: IContentOptimizationRequest,
  ): Promise<IContentScore> {
    const data = await this.request<IContentScore>(
      '/optimizers/analyze',
      'POST',
      request,
      'Failed to analyze content',
    );
    logger.info('Content analyzed', { score: data.overall });
    return data;
  }

  async optimizeContent(request: IContentOptimizationRequest): Promise<{
    original: string;
    optimized: string;
    changes: string[];
    score: IContentScore;
  }> {
    const data = await this.request<{
      original: string;
      optimized: string;
      changes: string[];
      score: IContentScore;
    }>('/optimizers/optimize', 'POST', request, 'Failed to optimize content');
    logger.info('Content optimized', { changes: data.changes.length });
    return data;
  }

  async optimizeHashtags(
    content: string,
    platform: string,
    count = 10,
  ): Promise<IHashtagOptimization> {
    const data = await this.request<IHashtagOptimization>(
      '/optimizers/hashtags',
      'POST',
      { content, count, platform },
      'Failed to optimize hashtags',
    );
    logger.info('Hashtags optimized', { count: data.optimal.length });
    return data;
  }

  async getBestPostingTimes(
    platform: string,
    timezone = 'UTC',
  ): Promise<IBestTimeToPost> {
    const data = await this.request<IBestTimeToPost>(
      `/optimizers/times?platform=${platform}&timezone=${timezone}`,
      'GET',
      undefined,
      'Failed to get best posting times',
    );
    logger.info('Best posting times retrieved', { platform });
    return data;
  }

  async generateVariants(
    content: string,
    count = 3,
    options?: {
      varyTone?: boolean;
      varyLength?: boolean;
      varyStyle?: boolean;
      targetAudiences?: string[];
    },
  ): Promise<IContentVariant[]> {
    const data = await this.request<IContentVariant[]>(
      '/optimizers/variants',
      'POST',
      { content, count, options },
      'Failed to generate variants',
    );
    logger.info('Content variants generated', { count: data.length });
    return data;
  }

  async getOptimizationHistory(params?: {
    limit?: number;
    contentType?: string;
  }): Promise<unknown[]> {
    const queryParams = new URLSearchParams();
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.contentType) {
      queryParams.append('contentType', params.contentType);
    }

    const queryString = queryParams.toString();
    const endpoint = queryString
      ? `/optimizers/history?${queryString}`
      : '/optimizers/history';

    const data = await this.request<unknown[]>(
      endpoint,
      'GET',
      undefined,
      'Failed to get optimization history',
      'collection',
    );
    logger.info('Optimization history retrieved', { count: data.length });
    return data;
  }

  calculateReadability(content: string): {
    score: number;
    grade: string;
    metrics: {
      wordCount: number;
      sentenceCount: number;
      avgWordsPerSentence: number;
      avgSyllablesPerWord: number;
      complexWords: number;
    };
    suggestions: string[];
  } {
    const words = content.trim().split(/\s+/);
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim());
    const wordCount = words.length;
    const sentenceCount = sentences.length || 1;
    const avgWordsPerSentence = wordCount / sentenceCount;

    const countSyllables = (word: string): number => {
      const lowerWord = word.toLowerCase();
      if (lowerWord.length <= 3) {
        return 1;
      }
      const vowels = lowerWord.match(/[aeiouy]{1,2}/g);
      return vowels ? vowels.length : 1;
    };

    const totalSyllables = words.reduce(
      (sum, word) => sum + countSyllables(word),
      0,
    );
    const avgSyllablesPerWord = totalSyllables / wordCount;
    const complexWords = words.filter(
      (word) => countSyllables(word) >= 3,
    ).length;

    // Flesch Reading Ease Score
    const fleschScore =
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
    const normalizedScore = Math.max(0, Math.min(100, fleschScore));

    const gradeThresholds: Array<[number, string]> = [
      [90, 'Very Easy'],
      [80, 'Easy'],
      [70, 'Fairly Easy'],
      [60, 'Standard'],
      [50, 'Fairly Difficult'],
      [30, 'Difficult'],
    ];
    const grade =
      gradeThresholds.find(
        ([threshold]) => normalizedScore >= threshold,
      )?.[1] ?? 'Very Difficult';

    const suggestions: string[] = [];
    if (avgWordsPerSentence > 20) {
      suggestions.push('Use shorter sentences for better readability');
    }
    if (complexWords / wordCount > 0.15) {
      suggestions.push('Simplify complex words where possible');
    }
    if (normalizedScore < 60) {
      suggestions.push('Content may be too complex for general audiences');
    }

    return {
      grade,
      metrics: {
        avgSyllablesPerWord,
        avgWordsPerSentence,
        complexWords,
        sentenceCount,
        wordCount,
      },
      score: normalizedScore,
      suggestions,
    };
  }
}

export class OptimizersService {
  private static instances: Map<string, ContentOptimizerServiceClass> =
    new Map();

  static getInstance(token: string): ContentOptimizerServiceClass {
    if (!OptimizersService.instances.has(token)) {
      OptimizersService.instances.set(
        token,
        new ContentOptimizerServiceClass(EnvironmentService.apiEndpoint, token),
      );
    }
    return OptimizersService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    OptimizersService.instances.delete(token);
  }
}
