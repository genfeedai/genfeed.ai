import { createHash } from 'node:crypto';
import { isTrustedMcpOriginProof } from '@api/action-origin/mcp-origin-proof.util';
import { describe, expect, it } from 'vitest';

const KEY = 'service-key';
const PROOF = createHash('sha256').update(KEY).digest('base64url');

describe('isTrustedMcpOriginProof', () => {
  it.each([
    ['the proof of the configured key', KEY, PROOF, true],
    [
      'a proof of another key',
      KEY,
      createHash('sha256').update('other').digest('base64url'),
      false,
    ],
    [
      'a non-ASCII value of the same string length',
      KEY,
      `é${PROOF.slice(1)}`,
      false,
    ],
    ['no proof', KEY, undefined, false],
    ['no configured key', undefined, PROOF, false],
    ['an empty configured key', '', PROOF, false],
  ])('%s', (_label, configured, supplied, expected) => {
    expect(isTrustedMcpOriginProof(configured, supplied)).toBe(expected);
  });
});
