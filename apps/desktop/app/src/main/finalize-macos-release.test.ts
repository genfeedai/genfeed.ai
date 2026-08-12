import { describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

interface MacosReleaseFinalizer {
  finalizeMacosRelease(releaseRoot: string): void;
}

const require = createRequire(import.meta.url);
const { finalizeMacosRelease } =
  require('../../scripts/finalize-macos-release.cjs') as MacosReleaseFinalizer;

describe('finalize macOS release metadata', () => {
  it('refreshes the stapled DMG checksum and removes its stale blockmap', () => {
    const releaseRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-macos-release-'),
    );
    const dmgName = 'GenFeed-0.1.1-arm64.dmg';
    const dmgPath = path.join(releaseRoot, dmgName);
    const blockmapPath = `${dmgPath}.blockmap`;
    const metadataPath = path.join(releaseRoot, 'latest-mac.yml');
    const dmgBytes = Buffer.from('notarized and stapled dmg');

    try {
      fs.writeFileSync(dmgPath, dmgBytes);
      fs.writeFileSync(blockmapPath, 'pre-staple blockmap');
      fs.writeFileSync(
        metadataPath,
        `version: 0.1.1
files:
  - url: GenFeed-0.1.1-arm64.zip
    sha512: zip-checksum
    size: 123
  - url: ${dmgName}
    sha512: stale-dmg-checksum
    size: 456
path: GenFeed-0.1.1-arm64.zip
sha512: zip-checksum
`,
      );

      finalizeMacosRelease(releaseRoot);

      const expectedChecksum = crypto
        .createHash('sha512')
        .update(dmgBytes)
        .digest('base64');
      const metadata = fs.readFileSync(metadataPath, 'utf8');

      expect(metadata).toContain(`sha512: ${expectedChecksum}`);
      expect(metadata).toContain(`size: ${dmgBytes.byteLength}`);
      expect(metadata).toContain('sha512: zip-checksum');
      expect(fs.existsSync(blockmapPath)).toBe(false);
    } finally {
      fs.rmSync(releaseRoot, { force: true, recursive: true });
    }
  });
});
