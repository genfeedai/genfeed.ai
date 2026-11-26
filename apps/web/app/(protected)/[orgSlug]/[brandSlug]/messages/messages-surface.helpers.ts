import type {
  SocialConversation,
  SocialInboxReference,
  SocialMessage,
} from '@genfeedai/contracts/interfaces';
import type { MessagesActionKind } from '@/features/messages/props/messages-surface-telemetry.props';

export type { MessagesActionKind } from '@/features/messages/props/messages-surface-telemetry.props';

export function getSocialInboxReferenceKey(
  reference: SocialInboxReference,
): string {
  return reference.kind === 'social-message'
    ? `${reference.kind}:${reference.conversationId}:${reference.messageId}`
    : `${reference.kind}:${reference.conversationId}`;
}

export function createSocialConversationReference(
  conversation: SocialConversation,
): SocialInboxReference | null {
  if (!conversation.organizationId || !conversation.brandId) {
    return null;
  }

  return {
    brandId: conversation.brandId,
    conversationId: conversation.id,
    kind: 'social-conversation',
    organizationId: conversation.organizationId,
  };
}

export function createSocialMessageReference(
  conversation: SocialConversation,
  message: SocialMessage,
): SocialInboxReference | null {
  if (
    !conversation.organizationId ||
    !conversation.brandId ||
    message.conversationId !== conversation.id
  ) {
    return null;
  }

  return {
    brandId: conversation.brandId,
    conversationId: conversation.id,
    kind: 'social-message',
    messageId: message.id,
    organizationId: conversation.organizationId,
  };
}

/**
 * One key per send attempt. A retry of the same draft reuses the key the caller
 * cached; a new draft, or the same screen after a reload, gets a new one. The
 * key carries a random part because a counter restarts at 1 on every page load
 * and then collided with the key of an earlier reply in the same conversation.
 */
export function createMessagesIdempotencyKey(
  conversationId: string,
  action: Extract<MessagesActionKind, 'draft' | 'dm' | 'reply'>,
): string {
  return `messages:${conversationId}:${action}:${crypto.randomUUID()}`;
}

export function toggleSocialInboxReference(
  references: readonly SocialInboxReference[],
  reference: SocialInboxReference,
): SocialInboxReference[] {
  const key = getSocialInboxReferenceKey(reference);
  const hasReference = references.some(
    (candidate) => getSocialInboxReferenceKey(candidate) === key,
  );

  return hasReference
    ? references.filter(
        (candidate) => getSocialInboxReferenceKey(candidate) !== key,
      )
    : [...references, reference];
}
