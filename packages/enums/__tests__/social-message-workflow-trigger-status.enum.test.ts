import { describe, expect, it } from 'vitest';
import { SocialMessageWorkflowTriggerStatus } from '../src/social-message-workflow-trigger-status.enum';

describe('social-message-workflow-trigger-status.enum', () => {
  it('matches every workflow trigger state written by social inbox ingestion', () => {
    expect(Object.values(SocialMessageWorkflowTriggerStatus)).toEqual([
      'pending',
      'enqueueing',
      'queued',
      'failed',
    ]);
  });
});
