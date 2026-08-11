/**
 * Instagram API response types
 */

/**
 * Instagram account details from Graph API
 */
export interface InstagramAccountDetails {
  id: string;
  username?: string;
  account_type?: string;
  media_count?: number;
}

/**
 * Instagram Business Account page information
 */
export interface InstagramPageResponse {
  id: string;
  image?: string;
  label?: string;
  username?: string;
  isBusinessAccount?: boolean;
  platform?: string;
}

/**
 * Instagram credential with decrypted access token
 */
export interface InstagramCredentialResponse {
  id: string;
  accessToken: string;
  externalId?: string;
  isConnected?: boolean;
}

/**
 * Raw Graph API comment node, as returned by `/{media-id}/comments`.
 */
export interface InstagramGraphCommentNode {
  id?: string;
  text?: string;
  timestamp?: string;
  username?: string;
  from?: { id?: string; username?: string };
  replies?: { data?: InstagramGraphCommentNode[] };
}

export interface InstagramGraphCommentsResponse {
  data?: InstagramGraphCommentNode[];
}

/**
 * Raw Graph API message node nested inside a conversation.
 */
export interface InstagramGraphMessageNode {
  id?: string;
  message?: string;
  created_time?: string;
  from?: { id?: string; username?: string; name?: string };
}

/**
 * Raw Graph API conversation node, as returned by `/{ig-user-id}/conversations`.
 */
export interface InstagramGraphConversationNode {
  id?: string;
  updated_time?: string;
  participants?: {
    data?: Array<{ id?: string; username?: string; name?: string }>;
  };
  messages?: { data?: InstagramGraphMessageNode[] };
}

export interface InstagramGraphConversationsResponse {
  data?: InstagramGraphConversationNode[];
}

/**
 * A single comment (top-level or reply) on an Instagram media object,
 * flattened so that replies carry the top-level comment id as their thread id.
 */
export interface InstagramMediaComment {
  commentId: string;
  threadId: string;
  text: string;
  createdAt: Date;
  authorExternalId?: string;
  authorUsername?: string;
}

/**
 * Inbound message inside an Instagram Graph conversation.
 */
export interface InstagramConversationMessage {
  messageId: string;
  text: string;
  createdAt: Date;
  senderExternalId?: string;
  senderUsername?: string;
  senderName?: string;
}

/**
 * A Graph API conversation thread with the connected Instagram account, keyed
 * by the Graph conversation id and carrying the counterparty participant.
 */
export interface InstagramConversationThread {
  conversationId: string;
  updatedAt?: Date;
  participantExternalId?: string;
  participantUsername?: string;
  participantName?: string;
  messages: InstagramConversationMessage[];
}

/**
 * Instagram trending hashtag data
 */
export interface InstagramTrendingHashtag {
  topic: string;
  mentions: number;
  growthRate: number;
}
