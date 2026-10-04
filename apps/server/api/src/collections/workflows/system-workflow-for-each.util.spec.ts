import { executeAwaitedForEach } from '@api/collections/workflows/system-workflow-for-each.util';
import { describe, expect, it } from 'vitest';

describe('executeAwaitedForEach tenant isolation', () => {
  const items = ['org-a', 'org-b', 'org-c'];
  const childContexts = items.map((organizationId) => ({
    organizationId,
    userId: `user-${organizationId}`,
  }));

  it('records a tenant that cannot start its transaction without failing the others', async () => {
    const result = await executeAwaitedForEach({
      childContexts,
      executeItem: async (index) => {
        if (index === 1) {
          throw new Error(
            'Transaction API error: Unable to start a transaction in the given time.',
          );
        }
        return {
          provenance: {
            executionId: `exec-${index}`,
            workflowId: 'scoped-task',
          },
          result: items[index],
        };
      },
      failureMode: 'collect',
      items,
      maxConcurrency: 3,
    });

    expect(result.count).toBe(3);
    expect(result.results[0]).toMatchObject({ index: 0, result: 'org-a' });
    expect(result.results[1]).toEqual({
      error:
        'Transaction API error: Unable to start a transaction in the given time.',
      index: 1,
      status: 'failed',
    });
    expect(result.results[2]).toMatchObject({ index: 2, result: 'org-c' });
  });

  it('still fails fast by default semantics', async () => {
    await expect(
      executeAwaitedForEach({
        childContexts,
        executeItem: async () => {
          throw new Error('boom');
        },
        failureMode: 'fail-fast',
        items,
        maxConcurrency: 1,
      }),
    ).rejects.toThrow('boom');
  });
});
