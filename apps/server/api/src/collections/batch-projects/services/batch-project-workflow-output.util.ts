import { buildForEachChildIdempotencyKey } from '@api/collections/workflows/system-workflow-for-each.util';

/** Node id of the for-each step in the hidden workflow-batch parent graph. */
export const BATCH_WORKFLOW_FOR_EACH_NODE_ID = 'execute-items';

const OUTPUT_MEDIA_KEYS = ['video', 'image'] as const;
const OUTPUT_ID_KEYS = ['ingredientId', 'id'] as const;

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Candidate output ingredient ids of one child workflow run, most likely
 * first: the last node's output is checked before earlier ones, and a nested
 * `video` / `image` payload before the output itself. Callers verify each id
 * against the tenant's ingredients, so a non-media id here is harmless.
 */
export function readWorkflowOutputIngredientIds(
  nodeOutputs: readonly unknown[],
): string[] {
  const ids: string[] = [];
  for (const nodeOutput of [...nodeOutputs].reverse()) {
    const output = readRecord(nodeOutput);
    const candidates = [
      ...OUTPUT_MEDIA_KEYS.map((key) => readRecord(output[key])),
      output,
    ];
    for (const candidate of candidates) {
      for (const key of OUTPUT_ID_KEYS) {
        const id = readString(candidate[key]);
        if (id && !ids.includes(id)) {
          ids.push(id);
        }
      }
    }
  }
  return ids;
}

/** The version-pinned child workflow the batch parent fans out to. */
export function readBatchChildWorkflowVersionId(
  parentResult: unknown,
): string | undefined {
  const result = readRecord(parentResult);
  return (
    readString(
      readRecord(readRecord(result.metadata).batchExecution)
        .childWorkflowVersionId,
    ) ?? readString(readRecord(result.inputValues).childWorkflowVersionId)
  );
}

/** Idempotency key of the child run for one item of a workflow batch. */
export function batchChildExecutionKey(input: {
  childWorkflowVersionId: string;
  index: number;
  parentExecutionId: string;
}): string {
  return buildForEachChildIdempotencyKey({
    childWorkflowVersionId: input.childWorkflowVersionId,
    index: input.index,
    parentExecutionId: input.parentExecutionId,
    parentNodeId: BATCH_WORKFLOW_FOR_EACH_NODE_ID,
  });
}
