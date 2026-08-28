import { describe, expect, it, vi } from 'vitest';
import type { ActionExecutionRequest } from '../interfaces/action-execution.interface.js';
import { ActionExecutorRegistry } from './action-executor-registry.js';

function request(actionId: 'ai_action'): ActionExecutionRequest {
  return {
    context: {
      actionId,
      idempotencyKey: 'workflow:run-1:node-1',
      nodeId: 'node-1',
      organizationId: 'org-1',
      origin: 'workflow',
      runId: 'run-1',
      userId: 'user-1',
      workflowId: 'workflow-1',
      workflowVersionId: 'version-1',
    },
    input: { content: 'Draft' },
  };
}

describe('ActionExecutorRegistry', () => {
  it('rejects duplicate executor registrations', () => {
    const registry = new ActionExecutorRegistry();
    const executor = vi.fn().mockResolvedValue({ data: null });

    registry.register('ai_action', executor);

    expect(() => registry.register('ai_action', executor)).toThrow(
      'Duplicate Genfeed action executor: ai_action',
    );
  });

  it('fails closed when an action has no executor', async () => {
    const registry = new ActionExecutorRegistry();

    await expect(registry.execute(request('ai_action'))).rejects.toThrow(
      'No Genfeed action executor registered for ai_action',
    );
  });

  it('asserts complete action coverage', () => {
    const registry = new ActionExecutorRegistry();
    registry.register('ai_action', vi.fn().mockResolvedValue({ data: null }));

    expect(() =>
      registry.assertCoverage(['ai_action', 'generate_content']),
    ).toThrow('Missing Genfeed action executors: generate_content');
  });

  it('executes the one registered action implementation', async () => {
    const registry = new ActionExecutorRegistry();
    const executor = vi.fn().mockResolvedValue({ data: { text: 'Result' } });
    const invocation = request('ai_action');
    registry.register('ai_action', executor);

    await expect(registry.execute(invocation)).resolves.toEqual({
      data: { text: 'Result' },
    });
    expect(executor).toHaveBeenCalledWith(invocation);
  });
});
