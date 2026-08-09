import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowRefApi } from './workflow-ref-node.helpers';
import {
  configureWorkflowRefApi,
  workflowRefApi,
} from './workflow-ref-node.helpers';

afterEach(() => {
  configureWorkflowRefApi(undefined);
});

describe('workflowRefApi default (unconfigured)', () => {
  it('fetchReferencableWorkflows resolves an empty list', async () => {
    await expect(workflowRefApi.fetchReferencableWorkflows()).resolves.toEqual(
      [],
    );
  });

  it('fetchWorkflowInterface resolves an empty interface', async () => {
    await expect(
      workflowRefApi.fetchWorkflowInterface('wf-1'),
    ).resolves.toEqual({ inputs: [], outputs: [] });
  });

  it('validateReference resolves without error', async () => {
    await expect(
      workflowRefApi.validateReference('parent', 'child'),
    ).resolves.toBeUndefined();
  });
});

describe('configureWorkflowRefApi', () => {
  it('installs and resets the injected api', async () => {
    const injected: WorkflowRefApi = {
      fetchReferencableWorkflows: vi.fn().mockResolvedValue([
        {
          id: 'wf-2',
          interface: { inputs: [], outputs: [] },
          label: 'Child',
        },
      ]),
      fetchWorkflowInterface: vi
        .fn()
        .mockResolvedValue({ inputs: [], outputs: [] }),
      validateReference: vi.fn().mockResolvedValue(undefined),
    };

    configureWorkflowRefApi(injected);
    // `workflowRefApi` is a live module binding — read it after configuring.
    const result = await workflowRefApi.fetchReferencableWorkflows('wf-1');
    expect(result).toHaveLength(1);
    expect(injected.fetchReferencableWorkflows).toHaveBeenCalledWith('wf-1');

    configureWorkflowRefApi(undefined);
    await expect(workflowRefApi.fetchReferencableWorkflows()).resolves.toEqual(
      [],
    );
  });
});
