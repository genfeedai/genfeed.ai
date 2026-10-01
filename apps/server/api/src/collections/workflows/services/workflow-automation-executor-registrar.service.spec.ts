import { AUTOMATION_ACTION_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { ContentLearningWorkflowService } from '@api/collections/workflows/services/content-learning-workflow.service';
import { WorkflowAutomationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-automation-executor-registrar.service';
import { CONTENT_LEARNING_ACTION_IDS } from '@api/collections/workflows/templates/content-learning-workflows.template';
import type { NodeExecutor } from '@genfeedai/workflows/engine';
import { Test } from '@nestjs/testing';
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
  it('registers all six learning actions once and forwards authenticated scope and typed inputs', async () => {
    const execute = vi.fn().mockResolvedValue({ status: 'unavailable' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowAutomationExecutorRegistrarService,
        { provide: ContentLearningWorkflowService, useValue: { execute } },
      ],
    }).compile();
    try {
      const registrations = new Map<string, NodeExecutor>();
      const registerExecutor = vi.fn((id: string, executor: NodeExecutor) => {
        expect(registrations.has(id)).toBe(false);
        registrations.set(id, executor);
      });
      moduleRef.get(WorkflowAutomationExecutorRegistrarService).register({
        registerExecutor,
      } as never);
      expect([...registrations.keys()]).toEqual(
        Object.values(CONTENT_LEARNING_ACTION_IDS),
      );
      expect(registrations.size).toBe(6);
      for (const action of Object.values(CONTENT_LEARNING_ACTION_IDS)) {
        await registrations.get(action)?.(
          {
            config: { credentialId: 'credential', materializationOnly: false },
          } as never,
          new Map([['refreshBucket', 0]]),
          { organizationId: 'authenticated' } as never,
        );
        expect(execute).toHaveBeenLastCalledWith(action, 'authenticated', {
          credentialId: 'credential',
          materializationOnly: false,
          refreshBucket: 0,
        });
      }
      expect(execute).toHaveBeenCalledTimes(6);
    } finally {
      await moduleRef.close();
    }
  });
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
