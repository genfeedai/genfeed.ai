import type {
  AgentArtifactReference,
  ResearchFindingReferenceKind,
} from '@genfeedai/interfaces';
import type { JSONContent } from '@tiptap/core';

export interface ConversationComposerArtifactReference {
  label: string;
  reference: AgentArtifactReference;
}

export type ConversationComposerActionName =
  | 'analyze'
  | 'create'
  | 'publish'
  | 'remix'
  | 'reply'
  | 'discover'
  | 'schedule'
  | 'workflow';

export type ConversationComposerScope = 'brand' | 'organization';

export type ConversationComposerContextReferenceKind =
  ResearchFindingReferenceKind;

export interface ConversationComposerContextReference {
  authorization: 'authorized';
  id: string;
  kind: ConversationComposerContextReferenceKind;
  label: string;
}

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

export type ConversationComposerMode = 'chat' | 'image' | 'video' | 'voice';

export interface ConversationComposerSendOptions {
  artifactReferences?: AgentArtifactReference[];
  brandId?: string;
  /**
   * Composer modality for this turn. Orthogonal to the LLM `model` field —
   * steers generation tools (image/video/voice) vs plain conversation.
   */
  composerMode?: ConversationComposerMode;
  /**
   * Preferred generation-model key when composerMode is image/video/voice.
   * Null/omitted means automatic routing for that stack.
   */
  generationModelKey?: string | null;
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
