export const GENERATION_CONTEXT_SOURCE_KINDS = [
  'task_text',
  'knowledge_source',
  'brand',
] as const;

export type GenerationContextSourceKind =
  (typeof GENERATION_CONTEXT_SOURCE_KINDS)[number];

export interface GenerationContextSourceReceipt {
  id?: string;
  kind: GenerationContextSourceKind;
  title?: string;
}

/**
 * Identifies authorized sources applied to one generation. Task text is
 * transient and is never persisted as Knowledge by this receipt.
 */
export interface GenerationContextReceipt {
  brandId: string;
  isPersisted: false;
  sources: GenerationContextSourceReceipt[];
}

export interface SelectedGenerationContext {
  persist?: boolean;
  sourceIds?: string[];
  text?: string;
}
