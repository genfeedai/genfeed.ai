import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveExtensionId,
  EXTENSION_MANIFEST_PUBLIC_KEY,
  extensionOrigin,
  isExtensionId,
  resolveAllowedExtensionIds,
} from '../../../src/commands/host/extension-identity';

/** Computed independently with openssl: sha256 of the DER public key, first 16 bytes, hex mapped 0-f to a-p. */
const PINNED_EXTENSION_ID = 'djbmffnmdeekbejpfhammiijhdpjegcp';

const EXTENSION_PACKAGE = path.resolve(
  __dirname,
  '../../../../../apps/extensions/browser/app/package.json'
);

describe('extension identity', () => {
  it('derives the pinned extension ID from the public key', () => {
    expect(deriveExtensionId(EXTENSION_MANIFEST_PUBLIC_KEY)).toBe(PINNED_EXTENSION_ID);
  });

  it('pins the same public key in the extension manifest', () => {
    const extensionPackage = JSON.parse(readFileSync(EXTENSION_PACKAGE, 'utf8')) as {
      manifest: { key?: string };
    };
    expect(extensionPackage.manifest.key).toBe(EXTENSION_MANIFEST_PUBLIC_KEY);
  });

  it('commits no private key material', () => {
    const raw = readFileSync(EXTENSION_PACKAGE, 'utf8');
    expect(raw).not.toMatch(/PRIVATE KEY/u);
    expect(EXTENSION_MANIFEST_PUBLIC_KEY).not.toMatch(/PRIVATE/u);
  });

  it('allows the pinned ID plus extra IDs, once each', () => {
    const extra = 'abcdefghijklmnopabcdefghijklmnop';
    expect(resolveAllowedExtensionIds([extra, extra, PINNED_EXTENSION_ID])).toEqual([
      PINNED_EXTENSION_ID,
      extra,
    ]);
    expect(extensionOrigin(extra)).toBe(`chrome-extension://${extra}/`);
  });

  it('rejects anything that is not an extension ID', () => {
    expect(isExtensionId('abc')).toBe(false);
    expect(isExtensionId('ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP')).toBe(false);
    expect(isExtensionId('qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq')).toBe(false);
    expect(() => resolveAllowedExtensionIds(['nope'])).toThrow(/Not a Chrome extension ID/);
  });
});
