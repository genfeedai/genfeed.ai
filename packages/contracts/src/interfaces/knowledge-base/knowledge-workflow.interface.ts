/**
 * Server-generated provenance attached to Knowledge workflow node output.
 * Source/version pairs are derived from the canonical result, never caller input.
 */
export interface KnowledgeWorkflowSourceRef {
  sourceId: string;
  /** Null when the source has no current version. Never a fabricated id. */
  sourceVersionId: string | null;
}

export interface KnowledgeWorkflowProvenance {
  nodeId: string;
  runId: string;
  sources: KnowledgeWorkflowSourceRef[];
  workflowVersionId: string;
}
