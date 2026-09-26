import type { KnowledgeReceipt } from '../knowledge-base/knowledge-retrieval.interface';

export interface GenerationHarnessSettings {
  organizationEnabled: boolean | null;
  brandEnabled: boolean | null;
  brandId?: string;
  isEnabled: boolean;
  source: 'default' | 'organization' | 'brand';
}

export interface UpdateGenerationHarnessSettings {
  scope: 'organization' | 'brand';
  brandId?: string;
  isEnabled: boolean | null;
}

export interface GenerationHarnessReceipt {
  originalPrompt: string;
  enhancedPrompt: string;
  /**
   * `failed` means enhancement was enabled but a downstream dependency
   * (embedding, harness brief, or the enhancement model) errored; the caller
   * falls back to the original prompt instead of failing the generation.
   */
  status: 'applied' | 'skipped' | 'failed';
  source: 'default' | 'organization' | 'brand' | 'request';
  brandId: string;
  appliedPacks: Array<{ id: string; version: string }>;
  /** Exact Knowledge source versions folded into the enhanced prompt. */
  knowledgeReceipts?: KnowledgeReceipt[];
}
