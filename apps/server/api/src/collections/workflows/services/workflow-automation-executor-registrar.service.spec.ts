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

it('registers scoped durable agent report delivery actions for all supported channels', async () => {
  const deliverAgentReport = vi
    .fn()
    .mockResolvedValue({ status: 'delivered', deliveryId: 'delivery' });
  const registerExecutor = vi.fn();
  const registrar = new WorkflowAutomationExecutorRegistrarService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { deliverAgentReport } as never,
  );
  registrar.register({ registerExecutor } as never);
  for (const channel of ['telegram', 'discord', 'email']) {
    const registration = registerExecutor.mock.calls.find(
      ([name]) => name === `agent.report.deliver-${channel}`,
    );
    expect(registration).toBeDefined();
    const execute = registration?.[1];
    await execute(
      { config: {} },
      { deliveryId: 'delivery' },
      { organizationId: 'org' },
    );
    expect(deliverAgentReport).toHaveBeenCalledWith('org', 'delivery', channel);
  }
});
