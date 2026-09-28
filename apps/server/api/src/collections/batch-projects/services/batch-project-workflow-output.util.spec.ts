import {
  batchChildExecutionKey,
  readBatchChildWorkflowVersionId,
  readWorkflowOutputIngredientIds,
} from '@api/collections/batch-projects/services/batch-project-workflow-output.util';
import { buildForEachChildIdempotencyKey } from '@api/collections/workflows/system-workflow-for-each.util';

describe('batch project workflow output', () => {
  it('prefers the last node and a nested media payload', () => {
    expect(
      readWorkflowOutputIngredientIds([
        { image: { id: 'early-image' } },
        { id: 'node-output', video: { ingredientId: 'final-video' } },
      ]),
    ).toEqual(['final-video', 'node-output', 'early-image']);
  });

  it('reads an explicit output ingredient id first', () => {
    expect(
      readWorkflowOutputIngredientIds([
        { outputIngredientId: 'stitched', video: 'https://cdn/x.mp4' },
      ]),
    ).toEqual(['stitched']);
  });

  it('ignores outputs that carry no id', () => {
    expect(
      readWorkflowOutputIngredientIds([null, 'text', { url: 'x' }]),
    ).toEqual([]);
  });

  it('reads the pinned child version from batch metadata, then inputs', () => {
    expect(
      readBatchChildWorkflowVersionId({
        metadata: { batchExecution: { childWorkflowVersionId: 'version-1' } },
      }),
    ).toBe('version-1');
    expect(
      readBatchChildWorkflowVersionId({
        inputValues: { childWorkflowVersionId: 'version-2' },
      }),
    ).toBe('version-2');
    expect(readBatchChildWorkflowVersionId(null)).toBeUndefined();
  });

  it('derives the same child key the for-each runner writes', () => {
    expect(
      batchChildExecutionKey({
        childWorkflowVersionId: 'version-1',
        index: 2,
        parentExecutionId: 'parent-1',
      }),
    ).toBe(
      buildForEachChildIdempotencyKey({
        childWorkflowVersionId: 'version-1',
        index: 2,
        parentExecutionId: 'parent-1',
        parentNodeId: 'execute-items',
      }),
    );
  });
});
