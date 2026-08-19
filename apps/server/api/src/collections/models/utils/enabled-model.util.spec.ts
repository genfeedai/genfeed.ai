import {
  allowlistHasLiveModel,
  isModelOnAllowlist,
} from '@api/collections/models/utils/enabled-model.util';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

const modelId = testId('model');

describe('isModelOnAllowlist', () => {
  it('matches a registry id', () => {
    expect(
      isModelOnAllowlist({ id: modelId, key: 'google/nano-banana' }, [modelId]),
    ).toBe(true);
  });

  it('matches a model key stored in the allowlist', () => {
    expect(
      isModelOnAllowlist({ id: modelId, key: 'google/nano-banana' }, [
        'google/nano-banana',
      ]),
    ).toBe(true);
  });

  it('does not match an empty allowlist', () => {
    expect(
      isModelOnAllowlist({ id: modelId, key: 'google/nano-banana' }, []),
    ).toBe(false);
  });

  it('does not match a different id or key', () => {
    expect(
      isModelOnAllowlist({ id: modelId, key: 'google/nano-banana' }, [
        testId('model', 2),
        'black-forest-labs/flux-schnell',
      ]),
    ).toBe(false);
  });
});

describe('allowlistHasLiveModel', () => {
  it('is false when every stored id is stale', () => {
    expect(
      allowlistHasLiveModel(
        [testId('model', 9)],
        [{ id: modelId, key: 'google/nano-banana' }],
      ),
    ).toBe(false);
  });

  it('is true when a stored key matches a live row', () => {
    expect(
      allowlistHasLiveModel(
        ['google/nano-banana'],
        [{ id: modelId, key: 'google/nano-banana' }],
      ),
    ).toBe(true);
  });
});
