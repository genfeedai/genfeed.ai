import type {
  SocialConversation,
  SocialInboxReference,
} from '@genfeedai/contracts/interfaces';

export interface MessagesSurfaceAdapterParams {
  readonly canAttachReferences: boolean;
  readonly isConversationReferenced: boolean;
  readonly onToggleConversationReference: () => void;
  readonly references: readonly SocialInboxReference[];
  readonly selectedConversation: SocialConversation | null;
}

export type MessagesSurfaceInspectorProps = MessagesSurfaceAdapterParams;
