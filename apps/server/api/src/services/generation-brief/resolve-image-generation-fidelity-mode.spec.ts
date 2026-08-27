import { resolveImageGenerationFidelityMode } from '@api/services/generation-brief/resolve-image-generation-fidelity-mode';
import { describe, expect, it } from 'vitest';

describe('resolveImageGenerationFidelityMode', () => {
  it('returns off when no brand signal is present', () => {
    expect(resolveImageGenerationFidelityMode({})).toBe('off');
  });

  it('maps brandingMode brand and isBrandingEnabled to guided', () => {
    expect(resolveImageGenerationFidelityMode({ brandingMode: 'brand' })).toBe(
      'guided',
    );
    expect(
      resolveImageGenerationFidelityMode({ isBrandingEnabled: true }),
    ).toBe('guided');
  });

  it('lets an explicit fidelityMode win over brandingMode', () => {
    expect(
      resolveImageGenerationFidelityMode({
        brandingMode: 'off',
        fidelityMode: 'strict',
        isBrandingEnabled: false,
      }),
    ).toBe('strict');
  });
});
