import { describe, expect, it } from 'vitest';
import {
  isKnownUnavailableModel,
  PROVIDER_ENDPOINT_DATA_ERRORS,
} from './unpriced-models';

describe('isKnownUnavailableModel', () => {
  it.each([
    ['argil/atom', true],
    ['baai/bge-large-en-v1.5', true],
    ['fal-ai/runway-gen3', true],
    ['kwaivgi/kling-v1.6-pro', true],
    // Unpriced for another reason: the provider still serves them.
    ['meta/musicgen', false],
    ['black-forest-labs/flux-2-pro', false],
    ['google/veo-3', false],
  ])('%s -> %s', (modelKey, expected) => {
    expect(isKnownUnavailableModel(modelKey)).toBe(expected);
  });

  it('lists every data-error row as unavailable too', () => {
    expect(
      Object.keys(PROVIDER_ENDPOINT_DATA_ERRORS).every(isKnownUnavailableModel),
    ).toBe(true);
  });
});
