import type {
  SocialConversation,
  SocialInboxReference,
  SocialMessage,
} from '@genfeedai/interfaces';

export type MessagesActionKind =
  | 'approve'
  | 'draft'
  | 'dm'
  | 'reject'
  | 'reply'
  | 'status'
  | 'sync';

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

export function createMessagesIdempotencyKey(
  conversationId: string,
  action: Extract<MessagesActionKind, 'draft' | 'dm' | 'reply'>,
  draftRevision: number,
): string {
  return `messages:${conversationId}:${action}:${draftRevision}`;
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
