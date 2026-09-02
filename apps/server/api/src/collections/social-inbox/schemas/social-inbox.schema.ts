import type {
  SocialAutomationState as SocialAutomationStateEnum,
  SocialConversationStatus as SocialConversationStatusEnum,
  SocialConversationType as SocialConversationTypeEnum,
  SocialMessageDirection as SocialMessageDirectionEnum,
  SocialMessageType as SocialMessageTypeEnum,
} from '@genfeedai/contracts';
import type {
  SocialConversation as PrismaSocialConversation,
  SocialMessage as PrismaSocialMessage,
} from '@genfeedai/prisma';

export type SocialConversation = PrismaSocialConversation;
export type SocialConversationDocument = PrismaSocialConversation;
export type SocialMessage = PrismaSocialMessage;
export type SocialMessageDocument = PrismaSocialMessage;

export type SocialConversationStatus = `${SocialConversationStatusEnum}`;
export type SocialConversationType = `${SocialConversationTypeEnum}`;
export type SocialMessageDirection = `${SocialMessageDirectionEnum}`;
export type SocialMessageType = `${SocialMessageTypeEnum}`;
export type SocialAutomationState = `${SocialAutomationStateEnum}`;

export interface SocialConversationAvailability {
  canPostReply: boolean;
  canSendDm: boolean;
  postReplyReason?: string;
  sendDmReason?: string;
}
