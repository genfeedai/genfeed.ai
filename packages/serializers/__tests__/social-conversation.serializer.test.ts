import {
  SocialAutomationState,
  SocialConversationStatus,
  SocialConversationType,
  SocialInboxPlatform,
} from '@genfeedai/contracts';
import { SocialConversationSerializer } from '@serializers/server/social/social-conversation.serializer';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/helpers',
  async () => import('../../helpers/src/serializer.helper'),
);

describe('SocialConversationSerializer state contract', () => {
  it('preserves the canonical conversation wire values', () => {
    const output = SocialConversationSerializer.serialize({
      automationState: SocialAutomationState.PENDING_APPROVAL,
      conversationType: SocialConversationType.MENTION,
      createdAt: new Date('2026-07-28T00:00:00.000Z'),
      id: 'social-conversation-1',
      isDeleted: false,
      needsReview: true,
      platform: SocialInboxPlatform.LINKEDIN,
      priority: 'normal',
      status: SocialConversationStatus.NEEDS_REVIEW,
      tags: [],
      unreadCount: 1,
      updatedAt: new Date('2026-07-28T00:00:01.000Z'),
    }) as { data: { attributes: Record<string, unknown> } };

    expect(output.data.attributes).toMatchObject({
      automationState: 'pending_approval',
      conversationType: 'mention',
      platform: 'linkedin',
      status: 'needs_review',
    });
  });
});
