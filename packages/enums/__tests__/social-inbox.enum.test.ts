import { describe, expect, it } from 'vitest';
import {
  SocialActionActorType,
  SocialAutomationState,
  SocialConversationStatus,
  SocialConversationType,
  SocialInboxPlatform,
  SocialMessageDirection,
  SocialMessageType,
} from '../src/social-inbox.enum';

describe('social inbox enums', () => {
  it('defines the shipped wire values for every state family', () => {
    expect(Object.values(SocialInboxPlatform)).toEqual([
      'youtube',
      'instagram',
      'tiktok',
      'twitter',
      'linkedin',
      'unipile',
    ]);
    expect(Object.values(SocialConversationStatus)).toEqual([
      'open',
      'needs_review',
      'resolved',
      'archived',
    ]);
    expect(Object.values(SocialAutomationState)).toEqual([
      'manual',
      'drafted',
      'pending_approval',
      'approved',
      'automated',
      'failed',
    ]);
    expect(Object.values(SocialConversationType)).toEqual([
      'comment',
      'dm',
      'mention',
      'reply',
    ]);
    expect(Object.values(SocialMessageDirection)).toEqual([
      'inbound',
      'outbound',
      'system',
    ]);
    expect(Object.values(SocialMessageType)).toEqual([
      'comment',
      'dm',
      'draft',
      'note',
      'reply',
    ]);
    expect(Object.values(SocialActionActorType)).toEqual([
      'system',
      'user',
      'workflow',
    ]);
  });
});
