import { useCrunGenerationQuote as shared } from '@hooks/prompt-bar/use-crun-generation-quote/use-crun-generation-quote';
import { describe, expect, it } from 'vitest';
import { useCrunGenerationQuote } from './useCrunGenerationQuote';

describe('Studio Crun quote boundary', () => {
  it('reuses the shared scoped lifecycle', () => {
    expect(useCrunGenerationQuote).toBe(shared);
  });
});
