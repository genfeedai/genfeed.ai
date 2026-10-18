import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRequestSerializerBuildReceipt,
  writeRequestSerializerBuildReceipt,
} from './request-serializer-build-receipt';

const runtime = {
  nextVersion: '16.4.1',
  pinnedNextVersion: '16.4.1',
  sourceSha: 'a'.repeat(40),
};
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('serializer production build provenance', () => {
  it('hashes the exact configuration bytes used for the build without retaining their contents', () => {
    const config = Buffer.from(
      'const config = { experimental: {} };\nexport default config;\n',
    );
    const receipt = createRequestSerializerBuildReceipt(config, runtime);
    expect(receipt).toEqual({
      schemaVersion: 1,
      mode: 'production-default',
      effectiveRequestCost: 200000,
      effectiveMaxChunkCountPerGroup: 40,
      effectiveMaxMergeChunkSize: 200000,
      runtime,
      nextConfigSha256: createHash('sha256').update(config).digest('hex'),
    });
    expect(JSON.stringify(receipt)).not.toContain(config.toString());
    expect(
      createRequestSerializerBuildReceipt(
        Buffer.concat([config, Buffer.from('\n')]),
        runtime,
      ).nextConfigSha256,
    ).not.toBe(receipt.nextConfigSha256);
  });

  it.each([
    'config.experimental = { turbopackChunking: { requestCost: 400000 } };',
    'config.experimental.turbopackChunking.requestCost = 400000;',
    'config.experimental = { turbopackChunking: { maxChunkCountPerGroup: 1 } };',
    'config.experimental = { turbopackChunking: { maxMergeChunkSize: 400000 } };',
  ])(
    'refuses to label explicit chunking overrides as production default: %s',
    (source) => {
      expect(() =>
        createRequestSerializerBuildReceipt(Buffer.from(source), runtime),
      ).toThrow('explicit chunking override');
    },
  );

  it('writes the pre-build receipt without modifying any configuration bytes', () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'serializer-build-receipt-'),
    );
    temporaryDirectories.push(directory);
    const config = path.join(directory, 'next.config.ts');
    const output = path.join(directory, 'proof/build.json');
    const original = Buffer.from(
      'const config = { experimental: { inlineCss: true } };\n',
    );
    writeFileSync(config, original);
    writeRequestSerializerBuildReceipt(config, output, runtime);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(
      createRequestSerializerBuildReceipt(original, runtime),
    );
    expect(readFileSync(config)).toEqual(original);
  });

  it.each([['--trial', '400000'], ['--trial-max-chunks', '1'], ['--unknown']])(
    'rejects obsolete or unknown trial options without writing evidence: %s',
    (...flags) => {
      const directory = mkdtempSync(
        path.join(os.tmpdir(), 'serializer-build-options-'),
      );
      temporaryDirectories.push(directory);
      const output = path.join(directory, 'build.json');
      const result = spawnSync(
        'bun',
        [
          fileURLToPath(
            new URL('./request-serializer-build-receipt.ts', import.meta.url),
          ),
          output,
          ...flags,
        ],
        { cwd: directory, encoding: 'utf8' },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('chunking trials are not supported');
      expect(existsSync(output)).toBe(false);
    },
  );
});
