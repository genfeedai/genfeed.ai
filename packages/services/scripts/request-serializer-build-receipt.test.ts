import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRequestSerializerBuildReceipt,
  finalizeRequestSerializerInput,
  prepareRequestSerializerInput,
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

function compilerInputFixture() {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'serializer-input-finalize-')),
  );
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, 'apps/app'), { recursive: true });
  mkdirSync(path.join(root, 'packages/serializers/dist'), { recursive: true });
  writeFileSync(
    path.join(root, 'apps/app/next.config.ts'),
    'export default {};\n',
  );
  const input = Buffer.from('export const Serializer = {};\n');
  const sourceMap = Buffer.from('{"version":3,"sources":[],"mappings":"AAAA"}');
  const hash = (bytes: Uint8Array) =>
    createHash('sha256').update(bytes).digest('hex');
  writeFileSync(
    path.join(root, 'packages/serializers/dist/request-runtime.bundle.js'),
    input,
  );
  writeFileSync(
    path.join(root, 'packages/serializers/dist/request-runtime.bundle.js.map'),
    sourceMap,
  );
  writeFileSync(
    path.join(
      root,
      'packages/serializers/dist/request-runtime.provenance.json',
    ),
    JSON.stringify({
      schemaVersion: 1,
      output: 'packages/serializers/dist/request-runtime.bundle.js',
      sourceMap: 'packages/serializers/dist/request-runtime.bundle.js.map',
      sha256: hash(input),
      sourceMapSha256: hash(sourceMap),
    }),
  );
  const prepared = prepareRequestSerializerInput(root, runtime);
  const loaded: unknown = createRequire(import.meta.url)(
    '../../../scripts/request-serializer-input-loader.cjs',
  );
  if (typeof loaded !== 'function')
    throw new Error('Missing actual input loader');
  const capture = () =>
    loaded.call(
      {
        rootContext: path.join(root, 'apps/app'),
        resourcePath: path.join(root, prepared.input.artifacts.javaScript.path),
        resourceQuery: '',
        target: 'web',
        mode: 'production',
      },
      input,
    );
  return { root, prepared, capture };
}

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
  it('binds actual raw loader input, package maps and current head in a fresh finalized receipt', () => {
    const f = compilerInputFixture();
    f.capture();
    const result = finalizeRequestSerializerInput(f.root, runtime);
    expect(result).toMatchObject({
      status: 'verified',
      buildId: f.prepared.input.buildId,
      compilerCallbacks: 1,
      runtime,
      artifacts: f.prepared.input.artifacts,
    });
    expect(result.preflightSha256).toBe(
      createHash('sha256')
        .update(
          readFileSync(
            path.join(f.root, '.bundle-size/request-serializers-build.json'),
          ),
        )
        .digest('hex'),
    );
  });

  it('fails closed when the compiler did not execute the loader, including cached builds', () => {
    const f = compilerInputFixture();
    expect(() => finalizeRequestSerializerInput(f.root, runtime)).toThrow();
    f.capture();
    const next = prepareRequestSerializerInput(f.root, runtime);
    expect(next.input.buildId).not.toBe(f.prepared.input.buildId);
    expect(() => finalizeRequestSerializerInput(f.root, runtime)).toThrow();
  });

  it.each([
    'packages/serializers/dist/request-runtime.bundle.js',
    'packages/serializers/dist/request-runtime.bundle.js.map',
    'packages/serializers/dist/request-runtime.provenance.json',
    'apps/app/next.config.ts',
  ])('rejects post-callback mutation of %s', (filename) => {
    const f = compilerInputFixture();
    f.capture();
    writeFileSync(
      path.join(f.root, filename),
      Buffer.concat([
        readFileSync(path.join(f.root, filename)),
        Buffer.from('\n'),
      ]),
    );
    expect(() => finalizeRequestSerializerInput(f.root, runtime)).toThrow();
  });

  it('rejects a stale head, invocation id, or input hash instead of trusting recorded callback counts', () => {
    const f = compilerInputFixture();
    f.capture();
    expect(() =>
      finalizeRequestSerializerInput(f.root, {
        ...runtime,
        sourceSha: 'b'.repeat(40),
      }),
    ).toThrow('runtime/head');
    const events = path.join(
      f.root,
      '.bundle-size/request-serializers-input.jsonl',
    );
    const original: Record<string, unknown> = JSON.parse(
      readFileSync(events, 'utf8'),
    );
    for (const changed of [
      { ...original, buildId: '00000000-0000-4000-8000-000000000000' },
      { ...original, inputSha256: 'c'.repeat(64) },
      { ...original, preflightSha256: 'd'.repeat(64) },
    ]) {
      writeFileSync(events, JSON.stringify(changed));
      expect(() => finalizeRequestSerializerInput(f.root, runtime)).toThrow(
        'stale',
      );
    }
  });
});
