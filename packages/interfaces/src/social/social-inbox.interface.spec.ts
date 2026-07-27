import { describe, expect, it } from 'bun:test';
import { SocialMessageWorkflowTriggerStatus } from '@genfeedai/enums';
import type { SocialMessage } from './social-inbox.interface';

const workflowTriggerContract = {
  workflowTriggerAttemptedAt: '2026-07-27T00:00:00.000Z',
  workflowTriggerError: null,
  workflowTriggerJobId: 'social-comment-trigger-org-message',
  workflowTriggerQueuedAt: '2026-07-27T00:00:01.000Z',
  workflowTriggerStatus: SocialMessageWorkflowTriggerStatus.QUEUED,
} satisfies Pick<
  SocialMessage,
  | 'workflowTriggerAttemptedAt'
  | 'workflowTriggerError'
  | 'workflowTriggerJobId'
  | 'workflowTriggerQueuedAt'
  | 'workflowTriggerStatus'
>;

describe('social inbox message contract', () => {
  it('exposes the persisted workflow trigger lifecycle fields', () => {
    expect(workflowTriggerContract).toEqual({
      workflowTriggerAttemptedAt: '2026-07-27T00:00:00.000Z',
      workflowTriggerError: null,
      workflowTriggerJobId: 'social-comment-trigger-org-message',
      workflowTriggerQueuedAt: '2026-07-27T00:00:01.000Z',
      workflowTriggerStatus: 'queued',
    });
  });
});
