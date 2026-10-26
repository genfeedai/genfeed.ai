import type { KnowledgeReceipt } from './knowledge-retrieval.interface';

/** One numbered source in an agent answer; `marker` matches the `[n]` in the text. */
export interface AgentKnowledgeCitation {
  marker: number;
  receipt: KnowledgeReceipt;
}

/**
 * Server-verified sources behind a chat answer, stored as `knowledgeCitations`
 * in the assistant message metadata. A citation the model produced but the
 * server could not verify is counted in `unsupportedCount` and never shown.
 */
export interface AgentKnowledgeCitations {
  citations: AgentKnowledgeCitation[];
  unsupportedCount: number;
}
