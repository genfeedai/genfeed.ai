import { describe, expect, it } from 'vitest';
import { buildMovingResourcesSummary } from './brand-relocation-summary.util';

describe('buildMovingResourcesSummary', () => {
  it('summarizes every moving resource in the relocation warning', () => {
    expect(
      buildMovingResourcesSummary([
        { count: 2, label: 'workflows', resource: 'workflow' },
        { count: 5, label: 'posts', resource: 'post' },
        {
          count: 1,
          label: 'workflow execution',
          resource: 'workflowExecution',
        },
      ]),
    ).toBe(
      'Also moving with it: 2 workflows, 5 posts, and 1 workflow execution.',
    );
  });

  it('omits the sentence when no resources move', () => {
    expect(
      buildMovingResourcesSummary([
        { count: 0, label: 'posts', resource: 'post' },
      ]),
    ).toBeNull();
  });
});
