import type { KnowledgeReceipt } from './knowledge-retrieval.interface';

/** One numbered source in an agent answer; `marker` matches the `[n]` in the text. */
export interface AgentKnowledgeCitation {
  marker: number;
  receipt: KnowledgeReceipt;
}

/** One side of two Brand Truth sources that contradict each other. */
export interface AgentKnowledgeConflictSource {
  /** The quoted passage that states this source's side. */
  excerpt: string;
  /** The `[n]` marker when the answer cites this source. */
  marker?: number;
  sourceId: string;
  title: string;
  version: number;
  versionId: string;
}

/** Two eligible Brand Truth sources the judge found to disagree (#5145). */
export interface AgentKnowledgeConflict {
  id: string;
  sources: [AgentKnowledgeConflictSource, AgentKnowledgeConflictSource];
  summary: string;
}

/**
 * Server-verified sources behind a chat answer, stored as `knowledgeCitations`
 * in the assistant message metadata. A citation the model produced but the
 * server could not verify is counted in `unsupportedCount` and never shown.
 */
export interface AgentKnowledgeCitations {
  citations: AgentKnowledgeCitation[];
  /** Open conflicts that involve a cited source, with both sides shown. */
  conflicts?: AgentKnowledgeConflict[];
  unsupportedCount: number;
}
