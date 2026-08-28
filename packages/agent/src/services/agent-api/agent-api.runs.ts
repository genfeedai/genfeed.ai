import type {
  AgentCreditsInfo,
  AgentRunPage,
  AgentRunSummary,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentInstallReadiness } from '@genfeedai/agent/services/agent-api.types';
import type { AgentApiError } from '@genfeedai/agent/services/agent-api-error';
import type { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';
import {
  buildAgentRunBrandQuery,
  buildAgentRunsQuery,
  createAgentRunPage,
  type ListAgentRunsParams,
} from '@genfeedai/agent/services/agent-run-api.helpers';
import { AgentExecutionStatus } from '@genfeedai/enums';
import type { JsonApiResponseDocument } from '@helpers/data/json-api/json-api.helper';
import { Effect } from 'effect';

export function getCreditsInfoEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentCreditsInfo, AgentApiError> {
  return api.fetchJsonEffect<AgentCreditsInfo>(
    `${api.config.baseUrl}/agent/credits`,
    { signal },
    'Failed to fetch credits info',
  );
}

export function getActiveRunsEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentRunSummary[], AgentApiError> {
  return api.fetchCollectionEffect<AgentRunSummary>(
    `${api.config.baseUrl}/runs/active`,
    { signal },
    'Failed to fetch active agent runs',
    'Failed to deserialize active runs',
  );
}

export function listRunsEffect(
  api: AgentBaseApiService,
  params: ListAgentRunsParams = {},
  signal?: AbortSignal,
): Effect.Effect<AgentRunPage, AgentApiError> {
  return api
    .fetchJsonEffect<JsonApiResponseDocument>(
      `${api.config.baseUrl}/runs?${buildAgentRunsQuery(params)}`,
      { signal },
      'Failed to fetch agent runs',
    )
    .pipe(
      Effect.flatMap((document) =>
        api
          .deserializeCollectionEffect<AgentRunSummary>(
            document,
            'Failed to deserialize agent runs',
          )
          .pipe(
            Effect.map((runs) => createAgentRunPage(document, runs, params)),
          ),
      ),
    );
}

export function getRunEffect(
  api: AgentBaseApiService,
  runId: string,
  brandId?: string,
  signal?: AbortSignal,
): Effect.Effect<AgentRunSummary, AgentApiError> {
  return api.fetchResourceEffect<AgentRunSummary>(
    `${api.config.baseUrl}/runs/${runId}${buildAgentRunBrandQuery(brandId)}`,
    { signal },
    'Failed to fetch agent run',
    'Failed to deserialize agent run',
  );
}

export function cancelRunEffect(
  api: AgentBaseApiService,
  runId: string,
  signal?: AbortSignal,
  brandId?: string,
): Effect.Effect<AgentRunSummary, AgentApiError> {
  return api.fetchResourceEffect<AgentRunSummary>(
    `${api.config.baseUrl}/runs/${runId}${buildAgentRunBrandQuery(brandId)}`,
    {
      body: JSON.stringify({ status: AgentExecutionStatus.CANCELLED }),
      method: 'PATCH',
      signal,
    },
    'Failed to cancel active agent run',
    'Failed to deserialize agent run',
  );
}

export function retryRunEffect(
  api: AgentBaseApiService,
  runId: string,
  signal?: AbortSignal,
  brandId?: string,
): Effect.Effect<AgentRunSummary, AgentApiError> {
  return api.fetchResourceEffect<AgentRunSummary>(
    `${api.config.baseUrl}/runs/${runId}/retries${buildAgentRunBrandQuery(brandId)}`,
    { method: 'POST', signal },
    'Failed to retry agent run',
    'Failed to deserialize agent run',
  );
}

export function getInstallReadinessEffect(
  api: AgentBaseApiService,
  signal?: AbortSignal,
): Effect.Effect<AgentInstallReadiness, AgentApiError> {
  return api.fetchJsonEffect<AgentInstallReadiness>(
    `${api.config.baseUrl}/onboarding/install-readiness`,
    { signal },
    'Failed to fetch local install readiness',
  );
}
