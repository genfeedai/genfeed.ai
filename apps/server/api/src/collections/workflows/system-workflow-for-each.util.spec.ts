import {
  executeAwaitedForEach,
  parseForEachOptions,
  scheduleForEach,
} from '@api/collections/workflows/system-workflow-for-each.util';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { describe, expect, it, vi } from 'vitest';

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
            workflowLabel: 'Scoped task',
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

describe('scheduled fan-out tenant isolation', () => {
  const request = {
    provenance: {
      executionId: 'parent-execution',
      workflowId: 'parent-workflow',
    },
  } as SystemWorkflowActionRequest;
  const items = ['org-a', 'org-b', 'org-c'];
  const childContexts = items.map((organizationId) => ({
    organizationId,
    userId: `user-${organizationId}`,
  }));
  const options = (failureMode?: 'collect' | 'fail-fast') =>
    parseForEachOptions({
      childWorkflowId: 'child-workflow',
      items,
      mode: 'scheduled',
      initialDelayMs: 100,
      interItemDelayMs: 50,
      ...(failureMode ? { failureMode } : {}),
    });

  it('records one rejected admission and continues scheduling later eligible tenants', async () => {
    const queueSystemWorkflow = vi.fn(
      async (input: { organizationId: string }, jobId: string) => {
        if (input.organizationId === 'org-b')
          throw new Error('Discovery disabled');
        return jobId;
      },
    );
    const result = await scheduleForEach({
      childContexts,
      options: options('collect'),
      parentNodeId: 'schedule',
      queueSystemWorkflow,
      request,
    });
    expect(result.count).toBe(3);
    expect(result.results).toEqual([
      { index: 0, jobId: expect.stringMatching(/^workflow\.for-each-/) },
      { index: 1, error: 'Discovery disabled', status: 'failed' },
      { index: 2, jobId: expect.stringMatching(/^workflow\.for-each-/) },
    ]);
    expect(queueSystemWorkflow).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        organizationId: 'org-c',
        userId: 'user-org-c',
      }),
      expect.any(String),
      { delayMs: 200 },
    );
  });

  it('preserves the default fail-fast behavior', async () => {
    const queueSystemWorkflow = vi
      .fn()
      .mockRejectedValue(new Error('Queue unavailable'));
    await expect(
      scheduleForEach({
        childContexts,
        options: options(),
        parentNodeId: 'schedule',
        queueSystemWorkflow,
        request,
      }),
    ).rejects.toThrow('Queue unavailable');
    expect(queueSystemWorkflow).toHaveBeenCalledTimes(1);
  });

  it('retains a known child execution identity on a collected scheduling failure', async () => {
    const queueSystemWorkflow = vi.fn().mockRejectedValue(
      Object.assign(new Error('Scheduling failed'), {
        workflowExecutionId: 'existing-child',
      }),
    );
    const result = await scheduleForEach({
      childContexts: childContexts.slice(0, 1),
      options: { ...options('collect'), items: items.slice(0, 1) },
      parentNodeId: 'schedule',
      queueSystemWorkflow,
      request,
    });
    expect(result.results).toEqual([
      {
        index: 0,
        error: 'Scheduling failed',
        executionId: 'existing-child',
        status: 'failed',
      },
    ]);
  });
});
