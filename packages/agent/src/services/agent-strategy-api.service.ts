import type {
  AgentStrategy,
  CreateAgentStrategyPayload,
  UpdateAgentStrategyPayload,
} from '@genfeedai/agent/models/agent-strategy.model';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';

export class AgentStrategyApiService extends AgentBaseApiService {
  async getStrategies(signal?: AbortSignal): Promise<AgentStrategy[]> {
    return this.fetchCollection<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies`,
      { signal },
      'Failed to fetch strategies',
      'Failed to deserialize strategies',
    );
  }

  async getStrategy(id: string, signal?: AbortSignal): Promise<AgentStrategy> {
    return this.fetchResource<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}`,
      { signal },
      'Failed to fetch strategy',
      'Failed to deserialize strategy',
    );
  }

  async createStrategy(
    payload: CreateAgentStrategyPayload,
    signal?: AbortSignal,
  ): Promise<AgentStrategy> {
    return this.fetchResource<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies`,
      { body: JSON.stringify(payload), method: 'POST', signal },
      'Failed to create strategy',
      'Failed to deserialize strategy',
    );
  }

  async updateStrategy(
    id: string,
    payload: UpdateAgentStrategyPayload,
    signal?: AbortSignal,
  ): Promise<AgentStrategy> {
    return this.fetchResource<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}`,
      { body: JSON.stringify(payload), method: 'PATCH', signal },
      'Failed to update strategy',
      'Failed to deserialize strategy',
    );
  }

  async deleteStrategy(
    id: string,
    signal?: AbortSignal,
  ): Promise<AgentStrategy> {
    return this.fetchResource<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}`,
      { method: 'DELETE', signal },
      'Failed to delete strategy',
      'Failed to deserialize strategy',
    );
  }

  async toggleStrategy(
    id: string,
    signal?: AbortSignal,
  ): Promise<AgentStrategy> {
    return this.fetchResource<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}/toggle`,
      { method: 'POST', signal },
      'Failed to toggle strategy',
      'Failed to deserialize strategy',
    );
  }

  async runNow(id: string, signal?: AbortSignal): Promise<{ message: string }> {
    return this.fetchJson<{ message: string }>(
      `${this.config.baseUrl}/agent-strategies/${id}/run-now`,
      { method: 'POST', signal },
      'Failed to trigger run',
    );
  }
}
