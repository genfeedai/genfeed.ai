import { resolveVideoGenerationFidelityMode } from '@api/services/generation-brief/resolve-video-generation-fidelity-mode';
import { describe, expect, it } from 'vitest';

describe('resolveVideoGenerationFidelityMode', () => {
  it('lets an explicit fidelityMode win over brandingMode', () => {
    expect(
      resolveVideoGenerationFidelityMode({
        brandingMode: 'brand',
        fidelityMode: 'strict',
      }),
    ).toBe('strict');
  });
});
