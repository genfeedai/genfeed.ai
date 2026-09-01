import type { RouterPriority, UploadStatus } from '@genfeedai/enums';
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

export type ConversationComposerGenerationMode = 'auto' | 'image' | 'video';

export interface ConversationComposerGenerationSettings {
  aspectRatio: string;
  duration?: number;
  model?: string;
  outputs?: number;
  prioritize?: RouterPriority;
  resolution?: string;
}

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

export interface ConversationComposerSendOptions {
  artifactReferences?: AgentArtifactReference[];
  brandId?: string;
  generationMode?: ConversationComposerGenerationMode;
  generationSettings?: ConversationComposerGenerationSettings;
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
  status: UploadStatus;
  url?: string;
}

/** Library content picked via the visual reference picker (not TipTap tokens). */
export interface PersistedConversationComposerContentReference {
  contentTitle: string;
  contentType: string;
  id: string;
  thumbnailUrl?: string;
}

export interface PersistedConversationComposerDraft {
  attachments: PersistedConversationComposerAttachment[];
  contentReferences: PersistedConversationComposerContentReference[];
  document: JSONContent | null;
  plainText: string;
  updatedAt: string;
}
