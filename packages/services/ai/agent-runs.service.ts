/**
 * Agent Runs Service
 * Manages agent execution runs — list, create, cancel, get stats.
 * Backend: /runs API
 */

import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import type { IAgentRun, IAgentRunContent } from '@genfeedai/interfaces';
import type {
  AgentRunListQueryParams,
  AgentRunStats,
  AgentRunStatsQueryParams,
} from '@genfeedai/types';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

class AgentRunsServiceClass {
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

    return response.json();
  }

  async list(params?: AgentRunListQueryParams): Promise<IAgentRun[]> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.status) query.set('status', params.status);
    if (params?.trigger) query.set('trigger', params.trigger);
    if (params?.strategy) query.set('strategy', params.strategy);
    if (params?.q) query.set('q', params.q);
    if (params?.model) query.set('model', params.model);
    if (params?.routingPolicy) query.set('routingPolicy', params.routingPolicy);
    if (params?.sortMode) query.set('sortMode', params.sortMode);
    if (params?.historyOnly) query.set('historyOnly', 'true');
    if (params?.webSearchEnabled !== undefined) {
      query.set('webSearchEnabled', String(params.webSearchEnabled));
    }

    const queryStr = query.toString();
    const endpoint = `/runs${queryStr ? `?${queryStr}` : ''}`;

    const json = await this.request<JsonApiResponseDocument>(
      endpoint,
      'GET',
      undefined,
      'Failed to list agent runs',
    );
    return deserializeCollection<IAgentRun>(json);
  }

  async getActive(): Promise<IAgentRun[]> {
    const json = await this.request<JsonApiResponseDocument>(
      '/runs/active',
      'GET',
      undefined,
      'Failed to get active runs',
    );
    return deserializeCollection<IAgentRun>(json);
  }

  async getStats(params?: AgentRunStatsQueryParams): Promise<AgentRunStats> {
    const query = new URLSearchParams();
    if (params?.timeRange) {
      query.set('timeRange', params.timeRange);
    }

    return this.request<AgentRunStats>(
      `/runs/stats${query.toString() ? `?${query.toString()}` : ''}`,
      'GET',
      undefined,
      'Failed to get run stats',
    );
  }

  async getById(id: string): Promise<IAgentRun> {
    const json = await this.request<JsonApiResponseDocument>(
      `/runs/${id}`,
      'GET',
      undefined,
      'Failed to get agent run',
    );
    return deserializeResource<IAgentRun>(json);
  }

  async create(data: {
    label: string;
    objective?: string;
    creditBudget?: number;
  }): Promise<IAgentRun> {
    const json = await this.request<JsonApiResponseDocument>(
      '/runs',
      'POST',
      data,
      'Failed to create agent run',
    );
    return deserializeResource<IAgentRun>(json);
  }

  async cancel(id: string): Promise<IAgentRun> {
    const json = await this.request<JsonApiResponseDocument>(
      `/runs/${id}/cancellations`,
      'POST',
      undefined,
      'Failed to cancel agent run',
    );
    return deserializeResource<IAgentRun>(json);
  }

  async getBatch(
    ids: string[],
  ): Promise<
    Array<{ id: string; threadId: string | null; contentCount: number }>
  > {
    if (ids.length === 0) {
      return [];
    }

    const result = await this.request<{
      runs: Array<{
        id: string;
        threadId: string | null;
        contentCount: number;
      }>;
    }>(
      `/runs/batch?ids=${ids.join(',')}`,
      'GET',
      undefined,
      'Failed to get batch agent runs',
    );

    return result.runs;
  }

  async getRunContent(
    id: string,
    signal?: AbortSignal,
  ): Promise<IAgentRunContent> {
    const response = await fetch(`${this.baseURL}/runs/${id}/content`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      const error = new Error('Failed to get run content');
      logger.error('Failed to get run content', { error, id });
      throw error;
    }

    return response.json();
  }
}

export class AgentRunsService {
  private static instances: Map<string, AgentRunsServiceClass> = new Map();

  static getInstance(token: string): AgentRunsServiceClass {
    if (!AgentRunsService.instances.has(token)) {
      AgentRunsService.instances.set(
        token,
        new AgentRunsServiceClass(EnvironmentService.apiEndpoint, token),
      );
    }
    return AgentRunsService.instances.get(token)!;
  }

  static clearInstance(token: string): void {
    AgentRunsService.instances.delete(token);
  }
}
