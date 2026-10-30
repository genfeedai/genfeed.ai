import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
export interface ChatMessageMetadata {
  artifactReferences?: AgentArtifactReference[];
  generatedContent?: string;
  contentType?: string;
  platform?: string;
  mediaUrl?: string;
  wasInserted?: boolean;
  /** Set when the agent stopped on a plan that waits for approval. */
  proposedPlan?: ProposedPlan;
  reviewRequired?: boolean;
}

export interface ProposedPlan {
  content?: string;
  steps?: { status?: string; step?: string }[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: ChatMessageMetadata;
  createdAt: string;
}

export interface Thread {
  id: string;
  title?: string;
  platform?: string;
  brandId?: string;
  status: 'active' | 'archived';
  lastMessage?: string;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}
