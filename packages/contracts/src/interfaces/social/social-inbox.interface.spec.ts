import { describe, expect, it } from 'vitest';
import {
  SocialActionActorType,
  SocialAutomationState,
  SocialConversationStatus,
  SocialConversationType,
  SocialInboxPlatform,
  SocialMessageDirection,
  SocialMessageType,
  SocialMessageWorkflowTriggerStatus,
} from '../..';
import type {
  SocialConversation,
  SocialMessage,
} from './social-inbox.interface';

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

  it('uses canonical states across public conversation and message types', () => {
    const conversation = {
      automationState: SocialAutomationState.MANUAL,
      conversationType: SocialConversationType.COMMENT,
      platform: SocialInboxPlatform.YOUTUBE,
      status: SocialConversationStatus.OPEN,
    } satisfies Pick<
      SocialConversation,
      'automationState' | 'conversationType' | 'platform' | 'status'
    >;
    const message = {
      actionProvenance: {
        actorType: SocialActionActorType.WORKFLOW,
        platform: SocialInboxPlatform.YOUTUBE,
      },
      direction: SocialMessageDirection.INBOUND,
      messageType: SocialMessageType.COMMENT,
      platform: SocialInboxPlatform.YOUTUBE,
    } satisfies Pick<
      SocialMessage,
      'actionProvenance' | 'direction' | 'messageType' | 'platform'
    >;

    expect({ conversation, message }).toEqual({
      conversation: {
        automationState: 'manual',
        conversationType: 'comment',
        platform: 'youtube',
        status: 'open',
      },
      message: {
        actionProvenance: {
          actorType: 'workflow',
          platform: 'youtube',
        },
        direction: 'inbound',
        messageType: 'comment',
        platform: 'youtube',
      },
    });
  });
});
