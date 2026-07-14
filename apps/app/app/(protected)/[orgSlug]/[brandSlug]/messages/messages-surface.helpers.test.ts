import type { SocialConversation, SocialMessage } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  createMessagesIdempotencyKey,
  createSocialConversationReference,
  createSocialMessageReference,
  toggleSocialInboxReference,
} from './messages-surface.helpers';

const conversation: SocialConversation = {
  automationState: 'manual',
  brandId: 'brand-1',
  conversationType: 'comment',
  createdAt: '2026-07-13T08:00:00.000Z',
  id: 'conversation-1',
  needsReview: false,
  organizationId: 'organization-1',
  platform: 'youtube',
  priority: 'normal',
  status: 'open',
  tags: [],
  unreadCount: 1,
  updatedAt: '2026-07-13T08:00:00.000Z',
};

const message: SocialMessage = {
  body: 'Sensitive customer text',
  conversationId: conversation.id,
  createdAt: '2026-07-13T08:00:00.000Z',
  direction: 'inbound',
  id: 'message-1',
  messageType: 'comment',
  platform: 'youtube',
  senderName: 'Sensitive identity',
  status: 'received',
  updatedAt: '2026-07-13T08:00:00.000Z',
};

describe('Messages surface reference helpers', () => {
  it('creates typed selectors without copying message or identity data', () => {
    expect(createSocialConversationReference(conversation)).toEqual({
      brandId: 'brand-1',
      conversationId: 'conversation-1',
      kind: 'social-conversation',
      organizationId: 'organization-1',
    });
    expect(createSocialMessageReference(conversation, message)).toEqual({
      brandId: 'brand-1',
      conversationId: 'conversation-1',
      kind: 'social-message',
      messageId: 'message-1',
      organizationId: 'organization-1',
    });
  });

  it('rejects cross-conversation messages and incomplete scope', () => {
    expect(
      createSocialMessageReference(conversation, {
        ...message,
        conversationId: 'conversation-2',
      }),
    ).toBeNull();
    expect(
      createSocialConversationReference({ ...conversation, brandId: null }),
    ).toBeNull();
  });

  it('toggles each selector once and keeps idempotency keys deterministic', () => {
    const reference = createSocialConversationReference(conversation);
    expect(reference).not.toBeNull();
    if (!reference) {
      throw new Error('Expected a scoped conversation reference.');
    }

    const attached = toggleSocialInboxReference([], reference);
    expect(attached).toEqual([reference]);
    expect(toggleSocialInboxReference(attached, reference)).toEqual([]);
    expect(createMessagesIdempotencyKey('conversation-1', 'reply', 3)).toBe(
      createMessagesIdempotencyKey('conversation-1', 'reply', 3),
    );
    expect(createMessagesIdempotencyKey('conversation-1', 'reply', 4)).not.toBe(
      createMessagesIdempotencyKey('conversation-1', 'reply', 3),
    );
  });
});
