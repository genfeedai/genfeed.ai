import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

type LoaderContext = {
  rootContext: string;
  resourcePath: string;
  resourceQuery: string;
  target: string;
  mode: string;
};
type InputLoader = ((this: LoaderContext, input: Buffer) => Buffer) & {
  raw: boolean;
};
const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];
const resource = 'packages/serializers/dist/request-runtime.bundle.js';
const map = `${resource}.map`;
const provenance = 'packages/serializers/dist/request-runtime.provenance.json';
const buildId = '00000000-0000-4000-8000-000000000001';
const hash = (input: Uint8Array | string) =>
  createHash('sha256').update(input).digest('hex');

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'serializer-loader-input-')),
  );
  temporaryDirectories.push(root);
  mkdirSync(path.join(root, 'packages/serializers/dist'), { recursive: true });
  mkdirSync(path.join(root, '.bundle-size'));
  mkdirSync(path.join(root, 'apps/app'), { recursive: true });
  const input = Buffer.from('export const ExampleSerializer = {};\n');
  const sourceMap = Buffer.from(
    '{"version":3,"sources":["../src/request-runtime.ts"],"mappings":"AAAA"}',
  );
  const packageProof = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      output: resource,
      sourceMap: map,
      sha256: hash(input),
      sourceMapSha256: hash(sourceMap),
    }),
  );
  writeFileSync(path.join(root, resource), input);
  writeFileSync(path.join(root, map), sourceMap);
  writeFileSync(path.join(root, provenance), packageProof);
  const inputReceipt = {
    buildId,
    artifacts: {
      javaScript: { path: resource, sha256: hash(input), bytes: input.length },
      sourceMap: {
        path: map,
        sha256: hash(sourceMap),
        bytes: sourceMap.length,
      },
      provenance: {
        path: provenance,
        sha256: hash(packageProof),
        bytes: packageProof.length,
      },
    },
  };
  const receipt = {
    schemaVersion: 1,
    mode: 'production-default',
    runtime: {
      sourceSha: 'a'.repeat(40),
      nextVersion: '16.4.1',
      pinnedNextVersion: '16.4.1',
    },
    input: inputReceipt,
  };
  const report = path.join(root, '.bundle-size/request-serializers-build.json');
  writeFileSync(report, `${JSON.stringify(receipt)}\n`);
  const context: LoaderContext = {
    rootContext: path.join(root, 'apps/app'),
    resourcePath: path.join(root, resource),
    resourceQuery: '',
    target: 'web',
    mode: 'production',
  };
  const loader =
    require('./request-serializer-input-loader.cjs') as InputLoader;
  return {
    root,
    input,
    receipt,
    inputReceipt,
    report,
    context,
    loader,
    events: path.join(root, '.bundle-size/request-serializers-input.jsonl'),
  };
}

describe('actual browser compiler input receipt', () => {
  it('accepts the actual native app-project rootContext instead of the Turbopack filesystem root', () => {
    const f = fixture();
    const app = path.join(f.root, 'apps/app');
    mkdirSync(app, { recursive: true });
    expect(f.loader.call({ ...f.context, rootContext: app }, f.input)).toBe(
      f.input,
    );
  });

  it('returns the identical raw Buffer without modifying source or introducing a rename', () => {
    const f = fixture();
    expect(f.loader.raw).toBe(true);
    expect(f.loader.call(f.context, f.input)).toBe(f.input);
    expect(readFileSync(path.join(f.root, resource))).toEqual(f.input);
    const events = readFileSync(f.events, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events).toEqual([
      {
        schemaVersion: 1,
        buildId,
        resourcePath: resource,
        target: 'web',
        mode: 'production',
        inputSha256: hash(f.input),
        inputBytes: f.input.length,
        preflightSha256: hash(readFileSync(f.report)),
      },
    ]);
  });

  it.each([
    ['target', 'node'],
    ['mode', 'development'],
    ['resourceQuery', '?different-transform'],
  ] as const)('rejects an unexpected native %s context', (key, value) => {
    const f = fixture();
    expect(() =>
      f.loader.call({ ...f.context, [key]: value }, f.input),
    ).toThrow('compiler context');
  });

  it('rejects a filesystem or unrelated app rootContext even with valid package bytes', () => {
    const f = fixture();
    expect(() =>
      f.loader.call({ ...f.context, rootContext: f.root }, f.input),
    ).toThrow('compiler context');
    const other = path.join(f.root, 'apps/website');
    mkdirSync(other, { recursive: true });
    expect(() =>
      f.loader.call({ ...f.context, rootContext: other }, f.input),
    ).toThrow('compiler context');
  });

  it('rejects a different resource even when its basename matches', () => {
    const f = fixture();
    const alternate = path.join(f.root, 'other/request-runtime.bundle.js');
    mkdirSync(path.dirname(alternate));
    writeFileSync(alternate, f.input);
    expect(() =>
      f.loader.call({ ...f.context, resourcePath: alternate }, f.input),
    ).toThrow('resource path');
  });

  it('rejects modified actual callback bytes even when the disk artifact matches preflight', () => {
    const f = fixture();
    expect(() =>
      f.loader.call(f.context, Buffer.concat([f.input, Buffer.from('\n')])),
    ).toThrow('compiler input');
  });

  it.each([resource, map, provenance])(
    'rejects changed authenticated artifact %s',
    (filename) => {
      const f = fixture();
      appendFileSync(path.join(f.root, filename), '\n');
      expect(() => f.loader.call(f.context, f.input)).toThrow('artifact');
    },
  );

  it('rejects symlink substitution even if target bytes are identical', () => {
    const f = fixture();
    const external = path.join(f.root, 'outside.map');
    writeFileSync(external, readFileSync(path.join(f.root, map)));
    rmSync(path.join(f.root, map));
    symlinkSync(external, path.join(f.root, map));
    expect(() => f.loader.call(f.context, f.input)).toThrow('artifact path');
  });

  it('rejects forged artifact paths before reading a file outside the exact package entry', () => {
    const f = fixture();
    f.receipt.input.artifacts.sourceMap.path = '../../outside.map';
    writeFileSync(f.report, JSON.stringify(f.receipt));
    expect(() => f.loader.call(f.context, f.input)).toThrow('artifact path');
  });

  it('rejects missing or oversized preflight data and non-buffer input', () => {
    const f = fixture();
    writeFileSync(f.report, ' '.repeat(256 * 1024 + 1));
    expect(() => f.loader.call(f.context, f.input)).toThrow('budget');
    rmSync(f.report);
    expect(() => f.loader.call(f.context, f.input)).toThrow();
    expect(() =>
      f.loader.call(f.context, 'source' as unknown as Buffer),
    ).toThrow('raw Buffer');
  });

  it('rejects old-build events instead of silently reusing a cached receipt', () => {
    const f = fixture();
    f.loader.call(f.context, f.input);
    f.receipt.input.buildId = '00000000-0000-4000-8000-000000000002';
    writeFileSync(f.report, JSON.stringify(f.receipt));
    expect(() => f.loader.call(f.context, f.input)).toThrow('stale');
  });

  it('bounds callback event accumulation without accepting truncated evidence', () => {
    const f = fixture();
    writeFileSync(f.events, ' '.repeat(256 * 1024 + 1));
    expect(() => f.loader.call(f.context, f.input)).toThrow('budget');
  });
});
