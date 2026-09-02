import type { SocialConversationDocument } from '@api/collections/social-inbox/schemas/social-inbox.schema';
import {
  getAvailability,
  LINKEDIN_DM_UNAVAILABLE_REASON,
  normalizePlatform,
  readAvailability,
  sanitizeBody,
} from '@api/collections/social-inbox/services/social-inbox.helpers';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('social inbox helpers', () => {
  it('normalizes platform names', () => {
    expect(normalizePlatform(' Instagram ')).toBe('instagram');
  });

  it('removes markup and complete script or style blocks from message bodies', () => {
    expect(
      sanitizeBody(
        '<p>Hello</p><script>alert(1)</script><style>p{color:red}</style> world',
      ),
    ).toBe('Hello world');
  });

  it('preserves text from an unclosed blocked element like the previous matcher', () => {
    expect(sanitizeBody('<script>visible fallback')).toBe('visible fallback');
  });

  it('rejects bodies that contain only removable markup', () => {
    expect(() => sanitizeBody('<script>alert(1)</script>')).toThrow(
      BadRequestException,
    );
  });

  it('bounds the stored body after sanitizing', () => {
    expect(sanitizeBody('a'.repeat(20_000))).toHaveLength(10_000);
  });
});

describe('getAvailability', () => {
  it('disables post replies on a DM thread and explains why', () => {
    const availability = getAvailability({
      conversationType: SocialConversationType.DM,
      externalParentId: 'ig-message-1',
      participantExternalId: 'ig-participant-1',
      platform: Platform.INSTAGRAM,
    });

    expect(availability.canPostReply).toBe(false);
    expect(availability.postReplyReason).toBe(
      'Direct message threads have no post or comment to reply on',
    );
  });

  it('allows a DM send only when the participant external id is known', () => {
    expect(
      getAvailability({
        conversationType: SocialConversationType.DM,
        participantExternalId: 'ig-participant-1',
        platform: Platform.INSTAGRAM,
      }),
    ).toMatchObject({ canSendDm: true, sendDmReason: undefined });

    const withoutParticipant = getAvailability({
      conversationType: SocialConversationType.DM,
      platform: Platform.INSTAGRAM,
    });

    expect(withoutParticipant.canSendDm).toBe(false);
    expect(withoutParticipant.sendDmReason).toBe(
      'Instagram DM requires the participant recipient id',
    );
  });

  it('keeps comment threads replyable when a parent comment id exists', () => {
    expect(
      getAvailability({
        conversationType: SocialConversationType.COMMENT,
        externalParentId: 'ig-comment-1',
        participantExternalId: 'ig-participant-1',
        platform: Platform.INSTAGRAM,
      }),
    ).toEqual({
      canPostReply: true,
      canSendDm: true,
      postReplyReason: undefined,
      sendDmReason: undefined,
    });
  });

  it('allows an X comment reply and DM when the tweet and participant ids exist', () => {
    expect(
      getAvailability({
        conversationType: SocialConversationType.COMMENT,
        externalParentId: 'tweet-1',
        participantExternalId: 'x-user-1',
        platform: Platform.TWITTER,
      }),
    ).toEqual({
      canPostReply: true,
      canSendDm: true,
      postReplyReason: undefined,
      sendDmReason: undefined,
    });
  });

  it('never offers a LinkedIn DM on the connected-account path', () => {
    expect(
      getAvailability({
        conversationType: SocialConversationType.COMMENT,
        externalParentId: 'li-comment-1',
        participantExternalId: 'li-person-1',
        platform: Platform.LINKEDIN,
      }),
    ).toEqual({
      canPostReply: true,
      canSendDm: false,
      postReplyReason: undefined,
      sendDmReason: LINKEDIN_DM_UNAVAILABLE_REASON,
    });
  });

  it('never offers a DM on YouTube, whatever the conversation type', () => {
    expect(
      getAvailability({
        conversationType: SocialConversationType.DM,
        participantExternalId: 'channel-1',
        platform: Platform.YOUTUBE,
      }),
    ).toEqual({
      canPostReply: false,
      canSendDm: false,
      postReplyReason:
        'Direct message threads have no post or comment to reply on',
      sendDmReason: 'YouTube Data API does not support channel DMs',
    });
  });

  it('keeps every TikTok conversation read-only', () => {
    expect(
      getAvailability({
        conversationType: SocialConversationType.COMMENT,
        externalParentId: 'tiktok-comment-1',
        participantExternalId: 'tiktok-user-1',
        platform: Platform.TIKTOK,
      }),
    ).toEqual({
      canPostReply: false,
      canSendDm: false,
      postReplyReason: 'TikTok conversations are read-only in Genfeed',
      sendDmReason: 'TikTok conversations are read-only in Genfeed',
    });
  });

  it('ignores stale stored capability flags for TikTok', () => {
    const conversation = {
      availability: { canPostReply: true, canSendDm: true },
      conversationType: SocialConversationType.COMMENT,
      externalParentId: 'tiktok-comment-1',
      participantExternalId: 'tiktok-user-1',
      platform: Platform.TIKTOK,
    } as unknown as SocialConversationDocument;

    expect(readAvailability(conversation)).toMatchObject({
      canPostReply: false,
      canSendDm: false,
    });
  });
});
