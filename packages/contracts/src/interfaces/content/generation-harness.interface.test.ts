import { describe, expect, it } from 'vitest';
import { isGenerationEnhancementFailed } from './generation-harness.interface';

describe('persisted generation enhancement status', () => {
  it('recognizes only an explicit failure', () => {
    expect(
      isGenerationEnhancementFailed({
        status: 'skipped',
        isEnhancementFailed: true,
      }),
    ).toBe(true);
    for (const receipt of [
      undefined,
      null,
      [],
      false,
      'true',
      {},
      { status: 'applied' },
      { status: 'skipped' },
      { isEnhancementFailed: false },
      { isEnhancementFailed: 'true' },
    ]) {
      expect(isGenerationEnhancementFailed(receipt)).toBe(false);
    }
  });
});
