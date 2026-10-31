import type { SocialConversationModel } from '@genfeedai/models/social/social-conversation.model';
import { describe, expect, it } from 'vitest';
import { groupMessageConversations } from './messages-conversation-sidebar';

function conversation(
  id: string,
  overrides: Partial<SocialConversationModel> = {},
): SocialConversationModel {
  return {
    automationState: 'manual',
    conversationType: 'comment',
    createdAt: '2026-07-28T08:00:00.000Z',
    id,
    needsReview: false,
    platform: 'youtube',
    priority: 'normal',
    status: 'open',
    tags: [],
    unreadCount: 0,
    updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  } as SocialConversationModel;
}

describe('groupMessageConversations', () => {
  it('prioritizes unread and review conversations', () => {
    const groups = groupMessageConversations([
      conversation('read'),
      conversation('unread', { unreadCount: 2 }),
      conversation('review', { needsReview: true }),
      conversation('review-status', { status: 'needs_review' }),
    ]);

    expect(groups.needsYou.map(({ id }) => id)).toEqual([
      'unread',
      'review',
      'review-status',
    ]);
    expect(groups.inbox.map(({ id }) => id)).toEqual(['read']);
  });
});
