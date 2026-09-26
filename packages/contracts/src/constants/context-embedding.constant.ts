import { MODEL_KEYS } from './model-keys.constant';

/**
 * `baai/bge-large-en-v1.5` always returns 1024-dimension vectors regardless
 * of host. Keep this in sync with the model so stored context vectors never
 * need re-embedding after a host migration (#5161).
 */
export const CONTEXT_EMBEDDING_DIMENSION = 1024;
/**
 * Served through OpenRouter, not Replicate: the Replicate copy
 * (`nateraw/bge-large-en-v1.5`) was removed upstream and 404s (#5161). Same
 * model, same dimension, different host.
 */
export const DEFAULT_CONTEXT_EMBEDDING_MODEL =
  MODEL_KEYS.OPENROUTER_BAAI_BGE_LARGE_EN_V1_5;
