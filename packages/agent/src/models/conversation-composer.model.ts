import type { AgentArtifactReference } from '@genfeedai/interfaces';
import type { JSONContent } from '@tiptap/core';

export type ConversationComposerActionName =
  | 'analyze'
  | 'create'
  | 'publish'
  | 'remix'
  | 'reply'
  | 'research'
  | 'schedule'
  | 'workflow';

export type ConversationComposerScope = 'brand' | 'organization';

export interface ConversationComposerActionDefinition {
  description: string;
  isConsequentialProposal: boolean;
  label: string;
  name: ConversationComposerActionName;
  requiredScope: ConversationComposerScope;
  route: string;
}

export type ConversationComposerDispatchStatus =
  | 'dispatched'
  | 'unauthorized'
  | 'unavailable';

export interface ConversationComposerDispatchResult {
  message: string;
  status: ConversationComposerDispatchStatus;
}

export interface ConversationComposerActionInvocation {
  action: ConversationComposerActionDefinition;
  arguments: string;
}

export interface ConversationComposerSendOptions {
  artifactReferences?: AgentArtifactReference[];
  planModeEnabled?: boolean;
}

export interface UnknownConversationComposerCommand {
  command: string;
}

export type ParsedConversationComposerCommand =
  | { kind: 'action'; invocation: ConversationComposerActionInvocation }
  | { kind: 'none' }
  | { kind: 'unknown'; command: UnknownConversationComposerCommand };

export interface PersistedConversationComposerAttachment {
  error?: string;
  id: string;
  ingredientId?: string;
  kind: 'audio' | 'image' | 'video';
  name: string;
  previewUrl?: string;
  progress?: number;
  status: 'completed' | 'failed' | 'pending' | 'uploading';
  url?: string;
}

export interface PersistedConversationComposerDraft {
  attachments: PersistedConversationComposerAttachment[];
  document: JSONContent | null;
  hasFocusIntent: boolean;
  plainText: string;
  updatedAt: string;
}
