import { SocialMessageWorkflowTriggerStatus } from '@genfeedai/enums';
import { SocialMessageModel } from '@models/social/social-message.model';
import { describe, expect, it } from 'vitest';

describe('SocialMessageModel', () => {
  it('retains the serialized workflow trigger lifecycle contract', () => {
    const message = new SocialMessageModel({
      workflowTriggerAttemptedAt: '2026-07-27T00:00:00.000Z',
      workflowTriggerError: null,
      workflowTriggerJobId: 'social-comment-trigger-org-message',
      workflowTriggerQueuedAt: '2026-07-27T00:00:01.000Z',
      workflowTriggerStatus: SocialMessageWorkflowTriggerStatus.QUEUED,
    });

    expect(message).toMatchObject({
      workflowTriggerAttemptedAt: '2026-07-27T00:00:00.000Z',
      workflowTriggerError: null,
      workflowTriggerJobId: 'social-comment-trigger-org-message',
      workflowTriggerQueuedAt: '2026-07-27T00:00:01.000Z',
      workflowTriggerStatus: 'queued',
    });
  });
});
