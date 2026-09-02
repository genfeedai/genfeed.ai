import {
  SocialActionActorType,
  SocialInboxPlatform,
  SocialMessageDirection,
  SocialMessageType,
  SocialMessageWorkflowTriggerStatus,
} from '@genfeedai/contracts';
import { socialMessageAttributes } from '@serializers/attributes/social/social-message.attributes';
import { SocialMessageSerializer } from '@serializers/server/social/social-message.serializer';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/helpers',
  async () => import('../../helpers/src/serializer.helper'),
);

const ATTEMPTED_AT = new Date('2026-07-27T00:00:00.000Z');
const QUEUED_AT = new Date('2026-07-27T00:00:01.000Z');

function serializeWorkflowTrigger(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const output = SocialMessageSerializer.serialize({
    actionProvenance: {
      actorType: SocialActionActorType.WORKFLOW,
      platform: SocialInboxPlatform.YOUTUBE,
    },
    body: 'Ship it',
    createdAt: ATTEMPTED_AT,
    direction: SocialMessageDirection.INBOUND,
    id: 'social-message-1',
    isDeleted: false,
    messageType: SocialMessageType.COMMENT,
    platform: SocialInboxPlatform.YOUTUBE,
    privateInternalValue: 'must-not-leak',
    status: 'received',
    updatedAt: QUEUED_AT,
    workflowTriggerAttemptedAt: ATTEMPTED_AT,
    workflowTriggerError: 'redis unavailable',
    workflowTriggerJobId: 'social-comment-trigger-org-message',
    workflowTriggerQueuedAt: QUEUED_AT,
    workflowTriggerStatus: SocialMessageWorkflowTriggerStatus.QUEUED,
    ...overrides,
  }) as { data: { attributes: Record<string, unknown> } };

  return output.data.attributes;
}

describe('SocialMessageSerializer workflow trigger contract', () => {
  it('serializes every populated workflow trigger lifecycle field', () => {
    expect(serializeWorkflowTrigger()).toMatchObject({
      actionProvenance: {
        actorType: 'workflow',
        platform: 'youtube',
      },
      direction: 'inbound',
      messageType: 'comment',
      platform: 'youtube',
      workflowTriggerAttemptedAt: ATTEMPTED_AT,
      workflowTriggerError: 'redis unavailable',
      workflowTriggerJobId: 'social-comment-trigger-org-message',
      workflowTriggerQueuedAt: QUEUED_AT,
      workflowTriggerStatus: 'queued',
    });
  });

  it('preserves null lifecycle values', () => {
    expect(
      serializeWorkflowTrigger({
        workflowTriggerAttemptedAt: null,
        workflowTriggerError: null,
        workflowTriggerJobId: null,
        workflowTriggerQueuedAt: null,
        workflowTriggerStatus: null,
      }),
    ).toMatchObject({
      workflowTriggerAttemptedAt: null,
      workflowTriggerError: null,
      workflowTriggerJobId: null,
      workflowTriggerQueuedAt: null,
      workflowTriggerStatus: null,
    });
  });

  it('emits only fields declared by the serializer contract', () => {
    const attributes = serializeWorkflowTrigger();

    expect(Object.keys(attributes)).toEqual(
      expect.arrayContaining([
        'workflowTriggerAttemptedAt',
        'workflowTriggerError',
        'workflowTriggerJobId',
        'workflowTriggerQueuedAt',
        'workflowTriggerStatus',
      ]),
    );
    expect(
      Object.keys(attributes).every((key) =>
        socialMessageAttributes.includes(key),
      ),
    ).toBe(true);
    expect(attributes).not.toHaveProperty('privateInternalValue');
  });
});
