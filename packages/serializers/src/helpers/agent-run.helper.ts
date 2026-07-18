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

type RunFieldSanitizer = (value: unknown) => unknown;

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

function sanitizeRecordArray(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((entry) => selectKeys(entry, keys))
    : [];
}

const RUN_FIELD_SANITIZERS: Readonly<Record<string, RunFieldSanitizer>> = {
  error: (value) => sanitizeText(value, 2_000),
  label: (value) => sanitizeText(value, 240),
  metadata: sanitizeMetadata,
  objective: (value) => sanitizeText(value, 1_000),
  steps: (value) => sanitizeRecordArray(value, SAFE_STEP_KEYS),
  summary: (value) => sanitizeText(value, 2_000),
  toolCalls: (value) => sanitizeRecordArray(value, SAFE_TOOL_CALL_KEYS),
};

function sanitizePresentRunFields(
  run: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(RUN_FIELD_SANITIZERS)
      .filter(([key]) => key in run)
      .map(([key, sanitize]) => [key, sanitize(run[key])]),
  );
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
    ...sanitizePresentRunFields(run),
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
