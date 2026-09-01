import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import { createGenfeedActionExecutor } from './genfeed-action-executor';

function makeInput(
  actionId: string,
  contextOverrides: Partial<ExecutionContext> = {},
): ExecutorInput {
  const node: ExecutableNode = {
    config: { actionId },
    id: 'action-1',
    inputs: [],
    label: 'Action',
    type: 'genfeedAction',
  };
  const context: ExecutionContext = {
    executionId: 'execution-1',
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
    workflowVersionId: 'wf-version-1',
    ...contextOverrides,
  };

  return { context, inputs: new Map(), node };
}

describe('GenfeedActionExecutor idempotency', () => {
  it('uses the durable execution id across retry or resume run ids', async () => {
    const actionExecutor = vi.fn().mockResolvedValue({ data: { ok: true } });
    const executor = createGenfeedActionExecutor(actionExecutor);

    await executor.execute(makeInput('sendEmail', { runId: 'run-original' }));
    await executor.execute(makeInput('sendEmail', { runId: 'run-resumed' }));

    expect(actionExecutor).toHaveBeenCalledTimes(2);
    expect(actionExecutor.mock.calls[0]?.[0].context.idempotencyKey).toBe(
      'workflow:execution-1:action-1',
    );
    expect(actionExecutor.mock.calls[1]?.[0].context.idempotencyKey).toBe(
      'workflow:execution-1:action-1',
    );
  });

  it('omits the idempotency key for actions declaring none', async () => {
    const actionExecutor = vi.fn().mockResolvedValue({ data: { ok: true } });
    const executor = createGenfeedActionExecutor(actionExecutor);

    await executor.execute(makeInput('youtube.clip.read-session'));

    expect(actionExecutor.mock.calls[0]?.[0].context).not.toHaveProperty(
      'idempotencyKey',
    );
  });
});
