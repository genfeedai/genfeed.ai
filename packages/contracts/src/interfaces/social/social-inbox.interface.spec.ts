import { describe, expect, it } from 'vitest';
import {
  SocialActionActorType,
  SocialAutomationState,
  SocialConversationStatus,
  SocialConversationType,
  SocialInboxPlatform,
  SocialMessageDirection,
  SocialMessageType,
} from '../..';
import type {
  SocialConversation,
  SocialMessage,
} from './social-inbox.interface';

describe('social inbox message contract', () => {
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
