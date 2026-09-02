import { describe, expect, it } from 'vitest';
import {
  CONTEXT_EMBEDDING_DIMENSION,
  DEFAULT_CONTEXT_EMBEDDING_MODEL,
} from './context-embedding.constant';
import { MODEL_KEYS } from './model-keys.constant';

describe('context-embedding.constant', () => {
  it('pins the embedding model and dimension used by pgvector', () => {
    expect(CONTEXT_EMBEDDING_DIMENSION).toBe(1024);
    expect(DEFAULT_CONTEXT_EMBEDDING_MODEL).toBe(
      MODEL_KEYS.REPLICATE_NATERAW_BGE_LARGE_EN_V1_5,
    );
  });
});
