import { describe, expect, it } from 'vitest';
import type { ITurboRunItem } from '../turbo/turbo-run.interface';
import type { IPost } from './post.interface';

describe('remix downstream lineage contracts', () => {
  it('keeps run and variant identities on review items and posts', () => {
    const turboRunLineage = {
      contentRunId: 'run-1',
      variantId: 'variant-1',
    } satisfies Pick<ITurboRunItem, 'contentRunId' | 'variantId'>;
    const postLineage = {
      contentRunId: 'run-1',
      variantId: 'variant-1',
      workflowExecutionId: 'workflow-execution-1',
    } satisfies Pick<
      IPost,
      'contentRunId' | 'variantId' | 'workflowExecutionId'
    >;

    expect({ turboRunLineage, postLineage }).toEqual({
      turboRunLineage: {
        contentRunId: 'run-1',
        variantId: 'variant-1',
      },
      postLineage: {
        contentRunId: 'run-1',
        variantId: 'variant-1',
        workflowExecutionId: 'workflow-execution-1',
      },
    });
  });
});
