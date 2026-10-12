import { createHash } from 'node:crypto';

/**
 * Public half of the key pinned in the extension manifest
 * (`apps/extensions/browser/app/package.json` -> `manifest.key`). Unpacked
 * installs get a stable ID from it; the test suite asserts the two copies match.
 * The matching private key is not in the repository.
 */
export const EXTENSION_MANIFEST_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6n9lNymWyChoM8iJk9SoEDB+ykmhUpaFVmdqAodXXYy5Bqg9jb8mlgZqwBnoyggfjlgfbfz9OUu2+lxaMJJY0D1pags2jdWtn68niR8wzUBhKqcNQLJTckU7RpRjl+NARw80dbvIIKtAYXOpmcQR047bzt1dbOxx6CH4CtlINR+KWijNh+cGhuE3Xjj1ZOp9EEXw1CVeTyN97eYg62Y6eTfNoXQqWZG7VsiXeyIbBCuLNmpbDqiaNY5IjwCRFs0fd87mxceOsIIGjrhJ0eEJJ7RM6930d2dUF5wZ7yXWKhQaVjCsW1wnTrC8LqykXQ6esBUnkvOBuJ9rC9Xl+8jQPwIDAQAB';

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;

export function isExtensionId(value: string): boolean {
  return EXTENSION_ID_PATTERN.test(value);
}

/** Chrome derives an extension ID from the first 128 bits of SHA-256 over the DER public key, spelled a-p. */
export function deriveExtensionId(publicKeyBase64: string): string {
  return createHash('sha256')
    .update(Buffer.from(publicKeyBase64, 'base64'))
    .digest()
    .subarray(0, 16)
    .toString('hex')
    .replace(/[0-9a-f]/gu, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

export function extensionOrigin(extensionId: string): string {
  return `chrome-extension://${extensionId}/`;
}

/** The pinned ID, plus any extra IDs (a future Chrome Web Store build is a second origin). */
export function resolveAllowedExtensionIds(extraIds: readonly string[]): string[] {
  const invalid = extraIds.filter((id) => !isExtensionId(id));
  if (invalid.length > 0) {
    throw new Error(`Not a Chrome extension ID (32 letters a-p): ${invalid.join(', ')}`);
  }
  return [...new Set([deriveExtensionId(EXTENSION_MANIFEST_PUBLIC_KEY), ...extraIds])];
}
