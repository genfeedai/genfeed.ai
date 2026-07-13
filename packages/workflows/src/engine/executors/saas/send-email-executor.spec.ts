import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '../../execution/engine';
import type { ExecutableNode } from '../../types';
import type { ExecutorInput } from '../base-executor';
import {
  createSendEmailExecutor,
  type EmailSender,
  type SendEmailExecutor,
} from './send-email-executor';

function makeInput(
  config: Record<string, unknown>,
  inputData?: Record<string, unknown>,
): ExecutorInput {
  const node: ExecutableNode = {
    config,
    id: 'email-1',
    inputs: [],
    label: 'Send Email',
    type: 'sendEmail',
  };
  const inputs = new Map<string, unknown>();
  if (inputData) {
    for (const [key, value] of Object.entries(inputData)) {
      inputs.set(key, value);
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

describe('SendEmailExecutor', () => {
  let executor: SendEmailExecutor;
  let mockSender: EmailSender;

  beforeEach(() => {
    executor = createSendEmailExecutor();
    mockSender = vi.fn().mockResolvedValue(undefined);
    executor.setSender(mockSender);
  });

  it('creates via factory with the correct node type', () => {
    expect(executor.nodeType).toBe('sendEmail');
  });

  it('throws if sender not configured', async () => {
    const fresh = createSendEmailExecutor();
    await expect(
      fresh.execute(
        makeInput({}, { html: '<p>x</p>', subject: 's', to: 'a@b.c' }),
      ),
    ).rejects.toThrow('Email sender not configured');
  });

  it('no-ops when the upstream node marks the run as skipped', async () => {
    const result = await executor.execute(
      makeInput({}, { reason: 'no-trends', skipped: true }),
    );
    expect(mockSender).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      sent: false,
      skippedReason: 'no-trends',
    });
  });

  it('sends using wired inputs', async () => {
    const result = await executor.execute(
      makeInput(
        {},
        { html: '<p>Hello</p>', subject: 'Daily trends', to: 'owner@org.com' },
      ),
    );
    expect(mockSender).toHaveBeenCalledWith({
      html: '<p>Hello</p>',
      subject: 'Daily trends',
      to: 'owner@org.com',
    });
    expect(result.data).toMatchObject({ sent: true, to: 'owner@org.com' });
  });

  it('falls back to node config when inputs are absent', async () => {
    const result = await executor.execute(
      makeInput({ html: '<p>cfg</p>', subject: 'cfg', to: 'cfg@org.com' }),
    );
    expect(mockSender).toHaveBeenCalledWith({
      html: '<p>cfg</p>',
      subject: 'cfg',
      to: 'cfg@org.com',
    });
    expect(result.data).toMatchObject({ sent: true });
  });

  it('throws if recipient is missing', async () => {
    await expect(
      executor.execute(makeInput({}, { html: '<p>x</p>', subject: 's' })),
    ).rejects.toThrow('Email recipient (to) is required');
  });

  it('throws if subject is missing', async () => {
    await expect(
      executor.execute(makeInput({}, { html: '<p>x</p>', to: 'a@b.c' })),
    ).rejects.toThrow('Email subject is required');
  });

  it('throws if html body is missing', async () => {
    await expect(
      executor.execute(makeInput({}, { subject: 's', to: 'a@b.c' })),
    ).rejects.toThrow('Email body (html) is required');
  });
});
