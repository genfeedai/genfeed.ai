import {
  SocialAutomationState,
  SocialConversationStatus,
  SocialConversationType,
  SocialInboxPlatform,
  SocialMessageType,
} from '@genfeedai/contracts';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  SocialConversationUpdateDto,
  SocialDraftDto,
} from './social-inbox-action.dto';
import { SocialInboxQueryDto } from './social-inbox-query.dto';

describe('social inbox state DTOs', () => {
  it('accepts canonical query and mutation states', async () => {
    const query = Object.assign(new SocialInboxQueryDto(), {
      automationState: SocialAutomationState.PENDING_APPROVAL,
      conversationType: SocialConversationType.MENTION,
      platform: SocialInboxPlatform.LINKEDIN,
      status: SocialConversationStatus.NEEDS_REVIEW,
    });
    const update = Object.assign(new SocialConversationUpdateDto(), {
      status: SocialConversationStatus.RESOLVED,
    });
    const draft = Object.assign(new SocialDraftDto(), {
      messageType: SocialMessageType.REPLY,
      text: 'Ship it',
    });

    await expect(validate(query)).resolves.toEqual([]);
    await expect(validate(update)).resolves.toEqual([]);
    await expect(validate(draft)).resolves.toEqual([]);
  });

  it('rejects unsupported states before service execution', async () => {
    const query = Object.assign(new SocialInboxQueryDto(), {
      automationState: 'invented',
      conversationType: 'thread',
      platform: 'facebook',
      status: 'deleted',
    });
    const update = Object.assign(new SocialConversationUpdateDto(), {
      status: 'deleted',
    });
    const draft = Object.assign(new SocialDraftDto(), {
      messageType: SocialMessageType.COMMENT,
      text: 'Ship it',
    });

    await expect(validate(query)).resolves.toHaveLength(4);
    await expect(validate(update)).resolves.toHaveLength(1);
    await expect(validate(draft)).resolves.toHaveLength(1);
  });
});
