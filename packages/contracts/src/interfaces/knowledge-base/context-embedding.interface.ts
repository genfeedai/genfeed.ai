export interface ContextEmbeddingBackfillInput {
  maxEntries: number;
  cursor?: string;
}

/** Operation metadata, separate from the serialized context base's attributes. */
export interface ContextEmbeddingBackfillAdmission {
  admitted: number;
  skipped: number;
  nextCursor: string | null;
}

export interface ContextEmbeddingBackfillResult<TContextBase> {
  contextBase: TContextBase;
  admission: ContextEmbeddingBackfillAdmission;
}
