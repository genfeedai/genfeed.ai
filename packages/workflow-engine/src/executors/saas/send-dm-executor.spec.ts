import type { ExecutionContext } from '@workflow-engine/execution/engine';
import type { ExecutorInput } from '@workflow-engine/executors/base-executor';
import {
  createSendDmExecutor,
  type DmSender,
  SendDmExecutor,
} from '@workflow-engine/executors/saas/send-dm-executor';
import type { ExecutableNode } from '@workflow-engine/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeInput(
  config: Record<string, unknown>,
  inputData?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'dm-1',
    inputs: [],
    label: 'Send DM',
    type: 'sendDm',
  };
  const inputs = new Map<string, unknown>();
  if (inputData) {
    for (const [k, v] of Object.entries(inputData)) {
      inputs.set(k, v);
    }
  }
  const context: ExecutionContext = {
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'wf-1',
  };
  return { context, inputs, node };
}

describe('SendDmExecutor', () => {
  let executor: SendDmExecutor;
  let mockSender: DmSender;

  beforeEach(() => {
    executor = createSendDmExecutor();
    mockSender = vi.fn().mockResolvedValue({ messageId: 'msg-123' });
    executor.setSender(mockSender);
  });

  it('creates via factory', () => {
    expect(executor.nodeType).toBe('sendDm');
  });

  it('throws if sender not configured', async () => {
    const fresh = createSendDmExecutor();
    const input = makeInput({
      platform: 'twitter',
      recipientId: 'u1',
      text: 'hi',
    });
    await expect(fresh.execute(input)).rejects.toThrow(
      'DM sender not configured',
    );
  });

  it('sends DM with config values', async () => {
    const input = makeInput({
      platform: 'twitter',
      recipientId: 'user-456',
      text: 'Hello!',
    });
    const result = await executor.execute(input);
    expect(mockSender).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: 'twitter',
        recipientId: 'user-456',
        text: 'Hello!',
      }),
    );
    expect(result.data).toMatchObject({
      messageId: 'msg-123',
      platform: 'twitter',
      recipientId: 'user-456',
      success: true,
    });
  });

  it('uses input values when config is missing', async () => {
    const input = makeInput(
      { platform: 'twitter' },
      {
        recipientId: 'user-789',
        text: 'From input!',
      },
    );
    const result = await executor.execute(input);
    expect(result.data).toMatchObject({ success: true });
  });

  it('throws if recipientId missing', async () => {
    const input = makeInput({ platform: 'twitter', text: 'hello' });
    await expect(executor.execute(input)).rejects.toThrow(
      'Recipient ID is required',
    );
  });

  it('throws if text missing', async () => {
    const input = makeInput({ platform: 'twitter', recipientId: 'u1' });
    await expect(executor.execute(input)).rejects.toThrow(
      'DM text is required',
    );
  });

  it('validates platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'tiktok' },
      id: 'dm1',
      inputs: [],
      label: 'DM',
      type: 'sendDm',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(false);
  });

  it('validates valid platform', () => {
    const node: ExecutableNode = {
      config: { platform: 'twitter' },
      id: 'dm1',
      inputs: [],
      label: 'DM',
      type: 'sendDm',
    };
    const result = executor.validate(node);
    expect(result.valid).toBe(true);
  });
});
