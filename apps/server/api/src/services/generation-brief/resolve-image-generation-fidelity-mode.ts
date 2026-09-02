import type { GenerationFidelityMode } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';

export function resolveImageGenerationFidelityMode(input: {
  brandingMode?: 'off' | 'brand';
  fidelityMode?: GenerationFidelityMode;
  isBrandingEnabled?: boolean;
}): GenerationFidelityMode {
  if (input.fidelityMode) {
    return input.fidelityMode;
  }

  if (input.brandingMode === 'off') {
    return 'off';
  }

  if (input.brandingMode === 'brand' || input.isBrandingEnabled === true) {
    return 'guided';
  }

  return 'off';
}
