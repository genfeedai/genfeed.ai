import { describe, expect, it } from 'vitest';

import { isImageToVideoRequest } from './generation-defaults.util';

describe('isImageToVideoRequest', () => {
  it('returns false with no params', () => {
    expect(isImageToVideoRequest({})).toBe(false);
  });
});
