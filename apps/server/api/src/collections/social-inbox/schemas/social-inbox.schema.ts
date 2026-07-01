import type {
  SocialConversation as PrismaSocialConversation,
  SocialMessage as PrismaSocialMessage,
} from '@genfeedai/prisma';

export type SocialConversation = PrismaSocialConversation;
export type SocialConversationDocument = PrismaSocialConversation & {
  _id: string;
  brand?: string | null;
  credential?: string | null;
  organization: string;
  post?: string | null;
  user?: string | null;
};
export type SocialMessage = PrismaSocialMessage;
export type SocialMessageDocument = PrismaSocialMessage & {
  _id: string;
  brand?: string | null;
  conversation: string;
  credential?: string | null;
  organization: string;
  post?: string | null;
  user?: string | null;
};

export type SocialConversationStatus =
  | 'open'
  | 'needs_review'
  | 'resolved'
  | 'archived';

export type SocialConversationType = 'comment' | 'dm' | 'mention' | 'reply';
export type SocialMessageDirection = 'inbound' | 'outbound' | 'system';
export type SocialMessageType = 'comment' | 'reply' | 'dm' | 'note' | 'draft';
export type SocialAutomationState =
  | 'manual'
  | 'drafted'
  | 'pending_approval'
  | 'approved'
  | 'automated'
  | 'failed';

export interface SocialConversationAvailability {
  canPostReply: boolean;
  canSendDm: boolean;
  postReplyReason?: string;
  sendDmReason?: string;
}
