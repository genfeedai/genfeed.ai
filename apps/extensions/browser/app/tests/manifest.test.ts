import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionPackage = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'),
) as { manifest: { key?: string; permissions: string[] } };

describe('extension manifest', () => {
  it('requests native messaging for the optional local bridge', () => {
    expect(extensionPackage.manifest.permissions).toContain('nativeMessaging');
  });

  it('pins a public key so the unpacked extension keeps one ID', () => {
    expect(extensionPackage.manifest.key).toMatch(
      /^[A-Za-z0-9+/]{300,}={0,2}$/,
    );
    expect(JSON.stringify(extensionPackage)).not.toContain('PRIVATE KEY');
  });
});
