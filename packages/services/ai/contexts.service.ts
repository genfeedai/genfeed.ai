/**
 * Contexts Service
 * Retrieval and memory access for prompt grounding and saved brand content.
 * Backend: /contexts
 */

import type {
  IEnhancedPrompt,
  IRAGEnhanceRequest,
  IRAGQuery,
  IRAGResult,
} from '@genfeedai/contracts/interfaces/knowledge-base/knowledge-base.interface';
import { EnvironmentService } from '@services/core/environment.service';
import {
  deserializeCollection,
  deserializeResource,
} from '@services/core/json-api';
import { logger } from '@services/core/logger.service';
import { ServiceInstanceManager } from '@services/core/service-instance-manager';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const contextInstances = new ServiceInstanceManager<ContextsServiceClass>();
type DeserializeMode = 'resource' | 'collection' | 'none';
type ContextRecord = Record<string, unknown> & {
  id?: string;
  label?: string;
};

class ContextsServiceClass {
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

    if (deserialize === 'resource') {
      return deserializeResource<T>(json);
    }

    if (deserialize === 'collection') {
      return deserializeCollection(json) as T;
    }

    return json;
  }

  async createContext(data: Partial<ContextRecord>): Promise<ContextRecord> {
    const context = await this.request<ContextRecord>(
      '/contexts',
      'POST',
      data,
      'Failed to create context',
      'resource',
    );
    logger.info('Context created', {
      id: context.id,
      label: context.label,
    });
    return context;
  }

  async listContexts(): Promise<ContextRecord[]> {
    return this.request(
      '/contexts',
      'GET',
      undefined,
      'Failed to list contexts',
      'collection',
    );
  }

  async getContext(id: string): Promise<ContextRecord> {
    return this.request(
      `/contexts/${id}`,
      'GET',
      undefined,
      'Failed to get context',
      'resource',
    );
  }

  async updateContext(
    id: string,
    updates: Partial<ContextRecord>,
  ): Promise<ContextRecord> {
    const context = await this.request<ContextRecord>(
      `/contexts/${id}`,
      'PATCH',
      updates,
      'Failed to update context',
      'resource',
    );
    logger.info('Context updated', { id });
    return context;
  }

  async deleteContext(id: string): Promise<void> {
    await this.request(
      `/contexts/${id}`,
      'DELETE',
      undefined,
      'Failed to delete context',
    );
    logger.info('Context deleted', { id });
  }

  async query(query: IRAGQuery): Promise<IRAGResult> {
    const contextBaseId =
      query.contextBaseId ??
      query.contextBaseIds?.[0] ??
      query.knowledgeBaseIds?.[0];
    const rows = await this.request<
      Array<{
        content: string;
        metadata?: Record<string, unknown>;
        relevance: number;
      }>
    >(
      '/contexts/query',
      'POST',
      {
        contextBaseId,
        limit: query.maxResults,
        minRelevance: query.minRelevanceScore,
        query: query.query,
      },
      'Failed to query context memory',
    );
    const chunks = rows.map((row) => ({
      content: row.content,
      metadata: row.metadata,
      relevanceScore: row.relevance,
    }));
    const result: IRAGResult = {
      avgRelevanceScore:
        chunks.length === 0
          ? 0
          : chunks.reduce((sum, chunk) => sum + chunk.relevanceScore, 0) /
            chunks.length,
      chunks,
      queryTime: 0,
      totalResults: chunks.length,
    };
    logger.info('Context query executed', {
      query: query.query,
      results: result.totalResults,
    });
    return result;
  }

  async enhancePrompt(request: IRAGEnhanceRequest): Promise<IEnhancedPrompt> {
    const payload = await this.request<{
      context: Array<{ content: string; relevance: number; source: string }>;
      enhancedPrompt: string;
      estimatedQualityBoost: number;
      originalPrompt: string;
    }>(
      '/contexts/enhance',
      'POST',
      {
        contentType: request.contentType,
        contextBaseIds: request.contextBaseIds ?? request.knowledgeBaseIds,
        maxResults: 5,
        prompt: request.prompt,
        useAudience: request.useContext?.audienceData,
        useBrandVoice: request.useContext?.brandVoice,
        useContentLibrary: request.useContext?.pastContent,
      },
      'Failed to enhance prompt',
    );
    const result: IEnhancedPrompt = {
      context: payload.context.map((entry) => entry.content),
      enhancedPrompt: payload.enhancedPrompt,
      estimatedQualityBoost: payload.estimatedQualityBoost,
      improvements: [],
      originalPrompt: payload.originalPrompt,
      relevantKnowledge: payload.context.map((entry) => ({
        content: entry.content,
        relevanceScore: entry.relevance,
        source: { name: entry.source },
      })),
    };
    logger.info('Prompt enhanced with retrieved context', {
      contentType: request.contentType,
      qualityBoost: result.estimatedQualityBoost,
    });
    return result;
  }

  async getRelevantContext(
    prompt: string,
    contentType: string,
    options?: { brandId?: string; maxChunks?: number },
  ): Promise<{
    context: string[];
    sources: string[];
    relevanceScores: number[];
  }> {
    const payload = await this.request<{
      context: Array<{ content: string; relevance: number; source: string }>;
    }>(
      '/contexts/enhance',
      'POST',
      {
        contentType,
        maxResults: options?.maxChunks,
        prompt,
      },
      'Failed to get relevant context',
    );
    const result = {
      context: payload.context.map((entry) => entry.content),
      relevanceScores: payload.context.map((entry) => entry.relevance),
      sources: payload.context.map((entry) => entry.source),
    };
    logger.info('Relevant context retrieved', {
      contextCount: result.context.length,
    });
    return result;
  }
}

export class ContextsService {
  static getInstance(token: string): ContextsServiceClass {
    const cached = contextInstances.get(ContextsService, token);
    if (cached) {
      return cached;
    }

    const instance = new ContextsServiceClass(
      EnvironmentService.apiEndpoint,
      token,
    );
    contextInstances.set(ContextsService, token, instance);
    return instance;
  }

  static clearInstance(token: string): void {
    contextInstances.clear(ContextsService, token);
  }
}
