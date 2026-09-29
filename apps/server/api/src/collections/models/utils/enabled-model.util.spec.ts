import { isModelOnAllowlist } from '@api/collections/models/utils/enabled-model.util';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

const modelId = testId('model');

describe('isModelOnAllowlist', () => {
  it('does not match an empty allowlist', () => {
    expect(
      isModelOnAllowlist({ id: modelId, key: 'google/nano-banana' }, []),
    ).toBe(false);
  });
});
