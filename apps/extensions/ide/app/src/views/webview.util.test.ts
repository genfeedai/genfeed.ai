import { afterEach, describe, expect, it } from 'bun:test';
import { getWebviewNonce } from './webview.util';

const originalRandom = Math.random;

afterEach(() => {
  Math.random = originalRandom;
});

describe('getWebviewNonce', () => {
  it('preserves the 32-character alphanumeric nonce contract', () => {
    Math.random = () => 0;

    expect(getWebviewNonce()).toBe('A'.repeat(32));
  });
});
