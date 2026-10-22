/** The database ledger is authoritative; the queue carries no content or credentials. */
export interface ContextEmbeddingJobData {
  jobId: string;
  organizationId: string;
  generation: number;
}
