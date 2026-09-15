import { AUTOMATION_ACTION_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { WorkflowAutomationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-automation-executor-registrar.service';
import type { NodeExecutor } from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

function serviceDouble(): object {
  return new Proxy(
    {},
    {
      get: () => vi.fn(),
    },
  );
}

describe('WorkflowAutomationExecutorRegistrarService', () => {
  it('pins authenticated organization when finalizing returned account results', async () => {
    const executors = new Map<string, NodeExecutor>();
    const finalizeCollection = vi.fn().mockResolvedValue({});
    const registrar = new WorkflowAutomationExecutorRegistrarService(
      undefined,
      undefined,
      { finalizeCollection } as never,
    );
    registrar.register({
      registerExecutor: (id: string, executor: NodeExecutor) =>
        executors.set(id, executor),
    } as never);
    const collection = { count: 0, results: [] };
    await executors.get('analytics.collection.finalize')?.(
      { config: {} } as never,
      new Map([['collection', collection]]),
      { organizationId: 'authenticated' } as never,
    );
    expect(finalizeCollection).toHaveBeenCalledWith('authenticated', {
      collection,
    });
  });
  it('registers every automation action exactly once', () => {
    const registered: string[] = [];
    const engine = {
      registerExecutor: vi.fn((actionId: string) => {
        registered.push(actionId);
      }),
    };
    const registrar = new WorkflowAutomationExecutorRegistrarService(
      undefined,
      serviceDouble() as never,
      undefined,
      serviceDouble() as never,
      serviceDouble() as never,
      serviceDouble() as never,
      serviceDouble() as never,
      serviceDouble() as never,
      serviceDouble() as never,
      undefined,
    );

    registrar.register(engine as never);

    expect(registered).toEqual(
      expect.arrayContaining(Object.values(AUTOMATION_ACTION_IDS)),
    );
    expect(new Set(registered).size).toBe(registered.length);
  });
});
