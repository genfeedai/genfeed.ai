import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowData, WorkflowPersistenceService } from './types';
import {
  configureWorkflowPersistence,
  getWorkflowPersistence,
} from './workflowPersistence';

const workflow: WorkflowData = {
  _id: 'wf-1',
  edgeStyle: 'default',
  edges: [],
  name: 'Test',
  nodes: [],
};

function makeService(): WorkflowPersistenceService {
  return {
    create: vi.fn().mockResolvedValue(workflow),
    delete: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockResolvedValue(workflow),
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(workflow),
    update: vi.fn().mockResolvedValue(workflow),
  };
}

describe('workflowPersistence', () => {
  afterEach(() => {
    // Reset to the throwing default so tests don't leak a service into each other.
    configureWorkflowPersistence(undefined);
  });

  it('throws a clear "not configured" error for every method by default', async () => {
    const service = getWorkflowPersistence();

    await expect(
      service.create({ edges: [], name: 'x', nodes: [] }),
    ).rejects.toThrow(/not configured/);
    await expect(service.getById('id')).rejects.toThrow(/not configured/);
    await expect(service.getAll()).rejects.toThrow(/not configured/);
    await expect(service.delete('id')).rejects.toThrow(/not configured/);
    await expect(service.duplicate('id')).rejects.toThrow(/not configured/);
    await expect(
      service.update('id', { edges: [], name: 'x', nodes: [] }),
    ).rejects.toThrow(/not configured/);
  });

  it('routes calls to the configured service', async () => {
    const service = makeService();
    configureWorkflowPersistence(service);

    const result = await getWorkflowPersistence().getById('wf-1');

    expect(service.getById).toHaveBeenCalledWith('wf-1');
    expect(result).toEqual(workflow);
  });

  it('reverts to the throwing default when reconfigured with undefined', async () => {
    configureWorkflowPersistence(makeService());
    configureWorkflowPersistence(undefined);

    await expect(getWorkflowPersistence().getById('id')).rejects.toThrow(
      /not configured/,
    );
  });
});
