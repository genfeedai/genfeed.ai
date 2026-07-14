import {
  redactSensitiveString,
  redactSensitiveValue,
} from '@genfeedai/helpers';

const SAFE_METADATA_KEYS = [
  'actualModel',
  'actualModels',
  'agentScope',
  'campaignId',
  'lastRetryAt',
  'model',
  'requestedModel',
  'routingPolicy',
  'source',
  'threadId',
  'webSearchEnabled',
  'workflowExecutionId',
  'workflowId',
  'workflowRunId',
  'workspaceTaskId',
] as const;

const SAFE_AGENT_SCOPE_KEYS = [
  'brandId',
  'contextVersion',
  'isLegacyFallback',
  'organizationId',
  'provenanceId',
  'source',
  'threadId',
] as const;

const SAFE_STEP_KEYS = [
  'completedAt',
  'durationMs',
  'id',
  'index',
  'label',
  'startedAt',
  'status',
  'toolCallIds',
] as const;

const SAFE_TOOL_CALL_KEYS = [
  'creditsUsed',
  'durationMs',
  'error',
  'executedAt',
  'status',
  'toolName',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function selectKeys(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, redactSensitiveValue(value[key])]),
  );
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  const metadata = selectKeys(value, SAFE_METADATA_KEYS);

  if ('agentScope' in metadata) {
    metadata.agentScope = selectKeys(
      isRecord(value) ? value.agentScope : undefined,
      SAFE_AGENT_SCOPE_KEYS,
    );
  }

  return metadata;
}

function sanitizeText(value: unknown, maxLength: number): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  return redactSensitiveString(value).slice(0, maxLength);
}

/**
 * Produce the public operator contract for an agent run. Run records can carry
 * provider payloads in JSON fields, so only explicit provenance and execution
 * summary fields may cross the serializer boundary.
 */
export function sanitizeAgentRunForSerialization<
  T extends Record<string, unknown>,
>(run: T): T {
  return {
    ...run,
    ...('error' in run ? { error: sanitizeText(run.error, 2_000) } : {}),
    ...('label' in run ? { label: sanitizeText(run.label, 240) } : {}),
    ...('metadata' in run ? { metadata: sanitizeMetadata(run.metadata) } : {}),
    ...('objective' in run
      ? { objective: sanitizeText(run.objective, 1_000) }
      : {}),
    ...('steps' in run
      ? {
          steps: Array.isArray(run.steps)
            ? run.steps.map((step) => selectKeys(step, SAFE_STEP_KEYS))
            : [],
        }
      : {}),
    ...('summary' in run ? { summary: sanitizeText(run.summary, 2_000) } : {}),
    ...('toolCalls' in run
      ? {
          toolCalls: Array.isArray(run.toolCalls)
            ? run.toolCalls.map((toolCall) =>
                selectKeys(toolCall, SAFE_TOOL_CALL_KEYS),
              )
            : [],
        }
      : {}),
  } as T;
}

export function sanitizeAgentRunCollectionForSerialization<
  T extends Record<string, unknown>,
  P extends { docs: T[] },
>(collection: P): P {
  return {
    ...collection,
    docs: collection.docs.map((run) => sanitizeAgentRunForSerialization(run)),
  } as P;
}
