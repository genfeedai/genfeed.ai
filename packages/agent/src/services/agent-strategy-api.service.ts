import type {
  AgentStrategy,
  CreateAgentStrategyPayload,
  UpdateAgentStrategyPayload,
} from '@cloud/agent/models/agent-strategy.model';
import { type AgentApiError } from '@cloud/agent/services/agent-api-error';
import { AgentBaseApiService } from '@cloud/agent/services/agent-base-api.service';
import { Effect } from 'effect';

export class AgentStrategyApiService extends AgentBaseApiService {
  getStrategiesEffect(
    signal?: AbortSignal,
  ): Effect.Effect<AgentStrategy[], AgentApiError> {
    return this.fetchCollectionEffect<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies`,
      { signal },
      'Failed to fetch strategies',
      'Failed to deserialize strategies',
    );
  }

  getStrategyEffect(
    id: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentStrategy, AgentApiError> {
    return this.fetchResourceEffect<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}`,
      { signal },
      'Failed to fetch strategy',
      'Failed to deserialize strategy',
    );
  }

  createStrategyEffect(
    payload: CreateAgentStrategyPayload,
    signal?: AbortSignal,
  ): Effect.Effect<AgentStrategy, AgentApiError> {
    return this.fetchResourceEffect<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies`,
      { body: JSON.stringify(payload), method: 'POST', signal },
      'Failed to create strategy',
      'Failed to deserialize strategy',
    );
  }

  updateStrategyEffect(
    id: string,
    payload: UpdateAgentStrategyPayload,
    signal?: AbortSignal,
  ): Effect.Effect<AgentStrategy, AgentApiError> {
    return this.fetchResourceEffect<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}`,
      { body: JSON.stringify(payload), method: 'PATCH', signal },
      'Failed to update strategy',
      'Failed to deserialize strategy',
    );
  }

  deleteStrategyEffect(
    id: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentStrategy, AgentApiError> {
    return this.fetchResourceEffect<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}`,
      { method: 'DELETE', signal },
      'Failed to delete strategy',
      'Failed to deserialize strategy',
    );
  }

  toggleStrategyEffect(
    id: string,
    signal?: AbortSignal,
  ): Effect.Effect<AgentStrategy, AgentApiError> {
    return this.fetchResourceEffect<AgentStrategy>(
      `${this.config.baseUrl}/agent-strategies/${id}/toggle`,
      { method: 'POST', signal },
      'Failed to toggle strategy',
      'Failed to deserialize strategy',
    );
  }

  runNowEffect(
    id: string,
    signal?: AbortSignal,
  ): Effect.Effect<{ message: string }, AgentApiError> {
    return this.fetchJsonEffect<{ message: string }>(
      `${this.config.baseUrl}/agent-strategies/${id}/run-now`,
      { method: 'POST', signal },
      'Failed to trigger run',
    );
  }
}
