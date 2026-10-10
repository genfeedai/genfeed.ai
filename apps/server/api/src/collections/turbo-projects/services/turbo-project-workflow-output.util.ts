import { buildForEachChildIdempotencyKey } from '@api/collections/workflows/system-workflow-for-each.util';
import { readRecord, readString } from '@genfeedai/utils/data/extract.util';

/** Node id of the for-each step in the hidden workflow-batch parent graph. */
export const BATCH_WORKFLOW_FOR_EACH_NODE_ID = 'execute-items';

const OUTPUT_MEDIA_KEYS = ['video', 'image'] as const;
const OUTPUT_ID_KEYS = ['outputIngredientId', 'ingredientId', 'id'] as const;
/** Keys where media nodes (e.g. videoStitch) return their output as a URL. */
const OUTPUT_URL_KEYS = [
  'outputVideoUrl',
  'outputImageUrl',
  'videoUrl',
  'imageUrl',
  'video',
  'image',
  'url',
] as const;
/**
 * The canonical ingredient media URL (`<ingredients endpoint>/videos/<id>`,
 * as `WorkflowEngineExecutorHelperService` builds it) carries the id.
 */
const INGREDIENT_MEDIA_URL = /\/(?:images|videos)\/([^/?#]+)(?:[/?#]|$)/i;

function ingredientIdFromMediaUrl(value: unknown): string | undefined {
  const url = readString(value);
  return url ? url.match(INGREDIENT_MEDIA_URL)?.[1] : undefined;
}

/**
 * Candidate output ingredient ids of one child workflow run, most likely
 * first: the last node's output is checked before earlier ones, and a nested
 * `video` / `image` payload before the output itself. A node that returns its
 * media only as an ingredient URL is read through that URL before any earlier
 * node. Callers verify each id against the tenant's ingredients, so a
 * non-media or foreign id here is harmless.
 */
export function readWorkflowOutputIngredientIds(
  nodeOutputs: readonly unknown[],
): string[] {
  const ids: string[] = [];
  for (const nodeOutput of [...nodeOutputs].reverse()) {
    const output = readRecord(nodeOutput);
    // An explicit output id on the node wins over nested media payloads.
    const candidates = [
      { outputIngredientId: output.outputIngredientId },
      ...OUTPUT_MEDIA_KEYS.map((key) => readRecord(output[key])),
      output,
    ];
    const nodeIds = [
      ...candidates.flatMap((candidate) =>
        OUTPUT_ID_KEYS.map((key) => readString(candidate[key])),
      ),
      ...OUTPUT_URL_KEYS.map((key) => ingredientIdFromMediaUrl(output[key])),
    ];
    for (const id of nodeIds) {
      if (id && !ids.includes(id)) {
        ids.push(id);
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
