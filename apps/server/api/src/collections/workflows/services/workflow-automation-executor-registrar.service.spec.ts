import { AUTOMATION_ACTION_IDS } from '@api/collections/workflows/services/automation-workflow-definitions';
import { WorkflowAutomationExecutorRegistrarService } from '@api/collections/workflows/services/workflow-automation-executor-registrar.service';
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
