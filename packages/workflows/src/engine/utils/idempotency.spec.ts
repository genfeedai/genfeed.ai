import { describe, expect, it } from 'vitest';
import { deriveWorkflowActionIdempotencyKey } from './idempotency';

describe('deriveWorkflowActionIdempotencyKey', () => {
  it('derives the canonical execution and node key for run-node actions', () => {
    expect(
      deriveWorkflowActionIdempotencyKey({
        actionId: 'sendEmail',
        executionId: 'execution-1',
        nodeId: 'email-1',
      }),
    ).toBe('workflow:execution-1:email-1');
  });

  it('does not fabricate a key for actions with no idempotency policy', () => {
    expect(
      deriveWorkflowActionIdempotencyKey({
        actionId: 'youtube.clip.read-session',
        executionId: 'execution-1',
        nodeId: 'read-session-1',
      }),
    ).toBeUndefined();
  });

  it('fails closed when a run-node action has no durable execution id', () => {
    expect(() =>
      deriveWorkflowActionIdempotencyKey({
        actionId: 'sendEmail',
        nodeId: 'email-1',
      }),
    ).toThrow('requires a durable workflow executionId');
  });

  it('fails closed when the action is absent from the shared catalog', () => {
    expect(() =>
      deriveWorkflowActionIdempotencyKey({
        actionId: 'unknown-action',
        executionId: 'execution-1',
        nodeId: 'unknown-1',
      }),
    ).toThrow('Unknown Genfeed action: unknown-action');
  });
});
