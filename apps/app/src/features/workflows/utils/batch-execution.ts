import {
  IngredientCategory,
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type {
  BatchExecution,
  BatchExecutionItem,
  BatchExecutionSummary,
  ExecutionResult,
} from '@/features/workflows/services/workflow-api';

export const BATCH_WORKFLOW_EXECUTION_CANONICAL_ID = 'workflow.batch.execute';

type ChildResultEntry = {
  error?: string;
  executionId?: string;
  index: number;
  provenance?: Record<string, unknown>;
  result?: Record<string, unknown>;
  status?: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readIngredientStatus(value: unknown): IngredientStatus {
  return typeof value === 'string' &&
    (Object.values(IngredientStatus) as string[]).includes(value)
    ? (value as IngredientStatus)
    : IngredientStatus.GENERATED;
}

function readBatchMetadata(execution: ExecutionResult) {
  return readRecord(execution.metadata?.batchExecution);
}

function readIngredientIds(execution: ExecutionResult): string[] {
  const items = execution.inputValues?.items;
  return Array.isArray(items)
    ? items.filter((item): item is string => typeof item === 'string')
    : [];
}

function readChildResults(execution: ExecutionResult): ChildResultEntry[] {
  const output = execution.nodeResults.find(
    (nodeResult) => nodeResult.nodeId === 'execute-items',
  )?.output;
  const results = readRecord(output).results;
  if (!Array.isArray(results)) {
    return [];
  }
  return results.flatMap((value) => {
    const entry = readRecord(value);
    return typeof entry.index === 'number'
      ? [{ ...entry, index: entry.index } as ChildResultEntry]
      : [];
  });
}

function inferCategory(
  value: Record<string, unknown>,
): IngredientCategory | undefined {
  if (
    value.category === IngredientCategory.IMAGE ||
    typeof value.imageUrl === 'string' ||
    readRecord(value.image).id
  ) {
    return IngredientCategory.IMAGE;
  }
  if (
    value.category === IngredientCategory.VIDEO ||
    typeof value.videoUrl === 'string' ||
    readRecord(value.video).id
  ) {
    return IngredientCategory.VIDEO;
  }
  if (
    value.category === IngredientCategory.MUSIC ||
    typeof value.musicUrl === 'string' ||
    typeof value.audioUrl === 'string' ||
    typeof value.musicIngredientId === 'string' ||
    readRecord(value.music).id ||
    readRecord(value.audio).id
  ) {
    return IngredientCategory.MUSIC;
  }
  return undefined;
}

function findOutputSummary(result: Record<string, unknown>) {
  const nodeResults = Array.isArray(result.nodeResults)
    ? result.nodeResults
    : [{ output: result }];

  for (const nodeResult of [...nodeResults].reverse()) {
    const output = readRecord(readRecord(nodeResult).output);
    const candidates = [
      output,
      readRecord(output.video),
      readRecord(output.image),
      readRecord(output.music),
      readRecord(output.audio),
    ];
    for (const candidate of candidates) {
      const category = inferCategory(candidate) ?? inferCategory(output);
      const id =
        optionalString(candidate.musicIngredientId) ??
        optionalString(candidate.ingredientId) ??
        optionalString(candidate.id);
      if (!category || !id) {
        continue;
      }
      const ingredientUrl =
        optionalString(candidate.ingredientUrl) ??
        optionalString(candidate.imageUrl) ??
        optionalString(candidate.videoUrl) ??
        optionalString(candidate.musicUrl) ??
        optionalString(candidate.audioUrl);
      const thumbnailUrl =
        optionalString(candidate.thumbnailUrl) ??
        (category === IngredientCategory.IMAGE ? ingredientUrl : undefined);
      return {
        category,
        id,
        status: readIngredientStatus(candidate.status),
        ...(ingredientUrl ? { ingredientUrl } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      };
    }
  }
  return undefined;
}

function toExecutionItem(
  parentExecutionId: string,
  ingredientId: string,
  index: number,
  entry?: ChildResultEntry,
): BatchExecutionItem {
  const result = readRecord(entry?.result);
  const failed = entry?.status === 'failed';
  const executionId =
    optionalString(entry?.executionId) ??
    optionalString(entry?.provenance?.executionId);
  const outputSummary = failed ? undefined : findOutputSummary(result);
  const startedAt = optionalString(result.startedAt);
  const completedAt = optionalString(result.completedAt);
  return {
    id: executionId ?? `${parentExecutionId}:${index}`,
    ingredientId,
    status: failed
      ? WorkflowExecutionStatus.FAILED
      : entry
        ? WorkflowExecutionStatus.COMPLETED
        : WorkflowExecutionStatus.PENDING,
    ...(executionId ? { executionId } : {}),
    ...(outputSummary
      ? {
          outputCategory: outputSummary.category,
          outputIngredientId: outputSummary.id,
          outputSummary,
        }
      : {}),
    ...(failed && entry?.error ? { error: entry.error } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

export function toBatchExecution(
  execution: ExecutionResult,
): BatchExecution | null {
  const metadata = readBatchMetadata(execution);
  if (
    execution.metadata?.canonicalId !== BATCH_WORKFLOW_EXECUTION_CANONICAL_ID &&
    typeof metadata.childWorkflowId !== 'string'
  ) {
    return null;
  }
  const workflowId =
    optionalString(metadata.childWorkflowId) ??
    optionalString(execution.inputValues?.childWorkflowId);
  if (!workflowId) {
    return null;
  }

  const ingredientIds = readIngredientIds(execution);
  const childResults = new Map(
    readChildResults(execution).map((entry) => [entry.index, entry]),
  );
  const items = ingredientIds.map((ingredientId, index) =>
    toExecutionItem(execution.id, ingredientId, index, childResults.get(index)),
  );
  const completedCount = items.filter(
    (item) => item.status === WorkflowExecutionStatus.COMPLETED,
  ).length;
  const failedCount = items.filter(
    (item) => item.status === WorkflowExecutionStatus.FAILED,
  ).length;

  return {
    completedCount,
    createdAt: execution.createdAt,
    failedCount,
    id: execution.id,
    items,
    status: execution.status,
    totalCount: ingredientIds.length,
    updatedAt: execution.updatedAt,
    workflowId,
  };
}

export function toBatchExecutionSummary(
  execution: ExecutionResult,
): BatchExecutionSummary | null {
  const batch = toBatchExecution(execution);
  if (!batch) {
    return null;
  }
  return {
    completedCount: batch.completedCount,
    createdAt: batch.createdAt,
    failedCount: batch.failedCount,
    id: batch.id,
    status: batch.status,
    totalCount: batch.totalCount,
    workflowId: batch.workflowId,
  };
}
