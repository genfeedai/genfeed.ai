/**
 * Contexts Service
 * Retrieval and memory access for prompt grounding and saved brand content.
 * Backend: /contexts and /rag APIs
 */

import {
  deserializeCollection,
  deserializeResource,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type {
  IEnhancedPrompt,
  IRAGEnhanceRequest,
  IRAGQuery,
  IRAGResult,
} from '@genfeedai/interfaces/knowledge-base/knowledge-base.interface';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
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
        ...(body && { 'Content-Type': 'application/json' }),
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
    const result = await this.request<IRAGResult>(
      '/rag/query',
      'POST',
      query,
      'Failed to query context memory',
    );
    logger.info('RAG query executed', {
      query: query.query,
      results: result.totalResults,
    });
    return result;
  }

  async enhancePrompt(request: IRAGEnhanceRequest): Promise<IEnhancedPrompt> {
    const result = await this.request<IEnhancedPrompt>(
      '/rag/enhance',
      'POST',
      request,
      'Failed to enhance prompt',
    );
    logger.info('Prompt enhanced with RAG', {
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
    const result = await this.request<{
      context: string[];
      sources: string[];
      relevanceScores: number[];
    }>(
      '/rag/context',
      'POST',
      { contentType, prompt, ...options },
      'Failed to get relevant context',
    );
    logger.info('Relevant context retrieved', {
      contextCount: result.context.length,
    });
    return result;
  }
}

export class ContextsService {
  private static instances: Map<string, ContextsServiceClass> = new Map();

  static getInstance(token: string): ContextsServiceClass {
    if (!ContextsService.instances.has(token)) {
      ContextsService.instances.set(
        token,
        new ContextsServiceClass(EnvironmentService.apiEndpoint, token),
      );
    }
    return ContextsService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    ContextsService.instances.delete(token);
  }
}
