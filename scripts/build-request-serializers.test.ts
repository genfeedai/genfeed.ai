import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildResult } from 'esbuild';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
let artifact: string;
let buildDirectory: string | undefined;
const names = [
  'ActivityBulkPatchSerializer',
  'AvatarSerializer',
  'ImageEditSerializer',
  'ImageEditingRequestSerializer',
  'ImageGenerationSerializer',
  'ImageSerializer',
  'IngredientBulkDeleteSerializer',
  'IngredientMergeSerializer',
  'IngredientSerializer',
  'MemberInvitationSerializer',
  'MetadataSerializer',
  'MusicSerializer',
  'NotificationPreferenceSerializer',
  'OrganizationSettingSerializer',
  'SettingSerializer',
  'StripeCheckoutSerializer',
  'TagSerializer',
  'VideoCaptionSerializer',
  'VideoEditSerializer',
  'VideoGenerationSerializer',
  'VideoSerializer',
].sort();
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'request-runtime-package-'),
  );
  temporaryDirectories.push(directory);
  const sourcePath =
    'packages/serializers/src/server/ingredients/image.serializer.ts';
  const source =
    'export const ImageSerializer = { serialize: (value) => value };';
  mkdirSync(path.dirname(path.join(directory, sourcePath)), {
    recursive: true,
  });
  writeFileSync(path.join(directory, sourcePath), source);
  const outputPath = path.join(
    directory,
    'packages/serializers/dist/request-runtime.bundle.js',
  );
  const code =
    'export const ImageSerializer = {};\n//# sourceMappingURL=request-runtime.bundle.js.map\n';
  const map = {
    version: 3,
    sources: ['../src/server/ingredients/image.serializer.ts'],
    sourcesContent: [source],
    names: [],
    mappings: 'AAAA',
  };
  const outputFile = (file: string, text: string) => ({
    path: file,
    contents: Buffer.from(text),
    text,
    hash: createHash('sha256').update(text).digest('hex'),
  });
  const vendors = ['ts-jsonapi/lib/index.js', 'lodash/lodash.js'].map(
    (sourcePath) => {
      const name = `node_modules/${sourcePath}`;
      const contents = 'module.exports = {};';
      mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
      writeFileSync(path.join(directory, name), contents);
      map.sources.push(`../../../${name}`);
      map.sourcesContent.push(contents);
      return [name, contents] as const;
    },
  );
  const result: BuildResult = {
    mangleCache: undefined,
    errors: [],
    warnings: [],
    outputFiles: [
      outputFile(outputPath, code),
      outputFile(`${outputPath}.map`, JSON.stringify(map)),
    ],
    metafile: {
      inputs: Object.fromEntries(
        [[sourcePath, source], ...vendors].map(([name, source]) => [
          name,
          { bytes: source.length, imports: [] },
        ]),
      ),
      outputs: {
        'packages/serializers/dist/request-runtime.bundle.js': {
          bytes: code.length,
          imports: [],
          exports: names,
          entryPoint: 'packages/serializers/src/request-runtime.ts',
          inputs: Object.fromEntries(
            [[sourcePath, source], ...vendors].map(([name]) => [
              name,
              { bytesInOutput: code.length },
            ]),
          ),
        },
      },
    },
  };
  return { directory, result, sourcePath, source, outputPath };
}

describe('request serializer package artifact', () => {
  beforeAll(async () => {
    buildDirectory = mkdtempSync(
      path.join(os.tmpdir(), 'request-runtime-browser-'),
    );
    const { buildRequestSerializers } = await import(
      './build-request-serializers'
    );
    await buildRequestSerializers(root, { outputDirectory: buildDirectory });
    artifact = path.join(buildDirectory, 'request-runtime.bundle.js');
  });

  afterAll(() => {
    if (buildDirectory)
      rmSync(buildDirectory, { recursive: true, force: true });
  });

  it('exposes the existing package subpath and its declaration entry', () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(root, 'packages/serializers/package.json'),
        'utf8',
      ),
    );
    expect(manifest.exports['./request-runtime']).toEqual({
      types: './dist/request-runtime.d.ts',
      import: './dist/request-runtime.bundle.js',
      bun: './dist/request-runtime.bundle.js',
      default: './dist/request-runtime.bundle.js',
    });
    expect(
      existsSync(artifact),
      'Build @genfeedai/serializers before artifact tests',
    ).toBe(true);
  });

  it('runs the actual artifact without Node globals, imports or compatibility shims', () => {
    expect(
      existsSync(artifact),
      'Build @genfeedai/serializers before artifact tests',
    ).toBe(true);
    const script = `
      import { readFileSync } from 'node:fs';
      import { createContext, SourceTextModule } from 'node:vm';
      const context = createContext({});
      const bootstrap = new SourceTextModule('globalThis.self = globalThis; globalThis.window = globalThis;', { context });
      await bootstrap.link(() => { throw new Error('Unexpected bootstrap import'); });
      await bootstrap.evaluate();
      const originalCode = readFileSync(process.argv[1], 'utf8');
      const code = process.argv[2] === '--unbound-global' ? originalCode.replaceAll(/\\bglobalThis\\b/g, 'global') : originalCode;
      const module = new SourceTextModule(code, { context });
      await module.link((specifier) => { throw new Error('Unexpected runtime import: ' + specifier); });
      await module.evaluate();
      const runtime = module.namespace;
      const nodeRuntime = await import(process.argv[1]);
      const probe = new SourceTextModule('export default [typeof global, typeof process, typeof require, typeof Buffer];', { context });
      await probe.link(() => { throw new Error('Unexpected probe import'); });
      await probe.evaluate();
      const samples = new SourceTextModule("const sample = { id: 'media-1', label: 'Test', text: 'Snow', metadata: null, tags: [], brand: null, organization: null }; export default [{}, null, undefined, [], sample, [sample]];", { context });
      await samples.link(() => { throw new Error('Unexpected sample import'); });
      await samples.evaluate();
      const cases = Array.from(samples.namespace.default);
      const nodeSample = { id: 'media-1', label: 'Test', text: 'Snow', metadata: null, tags: [], brand: null, organization: null };
      const nodeCases = [{}, null, undefined, [], nodeSample, [nodeSample]];
      const wire = {};
      const nodeWire = {};
      for (const name of Object.keys(runtime).sort()) {
        wire[name] = cases.map((input) => {
          try { return JSON.stringify(runtime[name].serialize(input)); }
          catch (error) { return { error: error.name, message: error.message }; }
        });
      }
      for (const name of Object.keys(nodeRuntime).sort()) {
        nodeWire[name] = nodeCases.map((input) => {
          try { return JSON.stringify(nodeRuntime[name].serialize(input)); }
          catch (error) { return { error: error.name, message: error.message }; }
        });
      }
      const tag = runtime.TagSerializer;
      const previous = tag.opts;
      tag.opts = { ...previous, topLevelLinks: { self: '/tags?page=2' } };
      const links = tag.serialize([{ id: 'tag-1', label: 'A' }]).links;
      tag.opts = previous;
      await module.evaluate();
      console.log(JSON.stringify({ names: Object.keys(runtime).sort(), globals: Array.from(probe.namespace.default), wire, nodeWire, links, sameInstance: tag === module.namespace.TagSerializer }));
    `;
    const browser = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--max-old-space-size=1024',
          '--experimental-vm-modules',
          '--input-type=module',
          '-e',
          script,
          artifact,
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, NODE_OPTIONS: '' },
          timeout: 15000,
        },
      ),
    );
    const negative = spawnSync(
      process.execPath,
      [
        '--max-old-space-size=1024',
        '--experimental-vm-modules',
        '--input-type=module',
        '-e',
        script,
        artifact,
        '--unbound-global',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '' },
        timeout: 15000,
      },
    );
    expect(negative.status).not.toBe(0);
    expect(negative.stderr).toContain('ReferenceError: global is not defined');
    expect(browser.names).toEqual(names);
    expect(browser.globals).toEqual([
      'undefined',
      'undefined',
      'undefined',
      'undefined',
    ]);
    expect(browser.sameInstance).toBe(true);
    expect(browser.wire).toEqual(browser.nodeWire);
    expect(browser.links).toEqual({ self: '/tags?page=2' });
    for (const name of names) expect(browser.wire[name]).toHaveLength(6);
  });
});

describe('request runtime source provenance validator', () => {
  it('validates a single closed ESM output and retains the original canonical source hash', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result, sourcePath, source } = fixture();
    const proof = validateRequestRuntimeBuild(directory, result);
    expect(proof.inputs[sourcePath]).toMatchObject({
      sha256: createHash('sha256').update(source).digest('hex'),
      bytesInOutput: expect.any(Number),
    });
    expect(proof.exports).toEqual(names);
    expect(proof.compilerBindings).toEqual({ global: 'globalThis' });
    expect(proof.output).toBe(
      'packages/serializers/dist/request-runtime.bundle.js',
    );
    expect(proof.sourceMap).toBe(
      'packages/serializers/dist/request-runtime.bundle.js.map',
    );
  });

  it('authenticates absent vendor TS identities through the actual JS and its confined local map', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result } = fixture();
    const input = 'node_modules/ts-jsonapi/lib/index.js';
    const mapPath = `${input}.map`;
    const code = 'module.exports = {};\n//# sourceMappingURL=index.js.map';
    const upstream = JSON.stringify({
      version: 3,
      sources: ['../index.ts'],
      names: [],
      mappings: 'AAAA',
    });
    writeFileSync(path.join(directory, input), code);
    writeFileSync(path.join(directory, mapPath), upstream);
    const bundleMap = result.outputFiles?.find((file) =>
      file.path.endsWith('.map'),
    );
    if (!bundleMap) throw new Error('Missing fixture map');
    const composed = JSON.parse(
      Buffer.from(bundleMap.contents).toString('utf8'),
    );
    const index = composed.sources.indexOf(
      '../../../node_modules/ts-jsonapi/lib/index.js',
    );
    composed.sources[index] = '../../../node_modules/ts-jsonapi/index.ts';
    composed.sourcesContent[index] = null;
    bundleMap.contents = Buffer.from(JSON.stringify(composed));
    const proof = validateRequestRuntimeBuild(directory, result);
    expect(proof.inputs[input]).toMatchObject({
      sha256: createHash('sha256').update(code).digest('hex'),
      sourceMaps: [
        {
          path: mapPath,
          sha256: createHash('sha256').update(upstream).digest('hex'),
        },
      ],
      originalSources: [
        {
          path: 'node_modules/ts-jsonapi/index.ts',
          contentSha256: null,
          evidence: 'local-map-identity-only',
        },
      ],
    });
    for (const replacement of [
      {
        ...composed,
        sourcesContent: composed.sourcesContent.map(
          (value: string | null, i: number) =>
            i === index ? 'fabricated TS contents' : value,
        ),
      },
      {
        ...composed,
        sources: composed.sources.map((value: string, i: number) =>
          i === index ? '../../../node_modules/ts-jsonapi/unproven.ts' : value,
        ),
      },
    ]) {
      bundleMap.contents = Buffer.from(JSON.stringify(replacement));
      expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
        'original source',
      );
    }
  });

  it.each([
    'https://example.invalid/map.json',
    'data:application/json;base64,e30=',
    '../../../../escape.map',
    'missing.js.map',
  ])(
    'rejects unproven vendor map references without fetching: %s',
    async (reference) => {
      const { validateRequestRuntimeBuild } = await import(
        './build-request-serializers'
      );
      const { directory, result } = fixture();
      writeFileSync(
        path.join(directory, 'node_modules/ts-jsonapi/lib/index.js'),
        `module.exports = {};\n//# sourceMappingURL=${reference}`,
      );
      expect(() => validateRequestRuntimeBuild(directory, result)).toThrow();
    },
  );

  it('rejects cycles, conflicting original contents, traversal depth and source-map read overflow', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result } = fixture();
    const input = path.join(directory, 'node_modules/ts-jsonapi/lib/index.js');
    const mapPath = `${input}.map`;
    writeFileSync(
      input,
      'module.exports = {};\n//# sourceMappingURL=index.js.map',
    );
    for (const upstream of [
      { version: 3, sources: ['index.js'], mappings: 'AAAA' },
      {
        version: 3,
        sources: ['../index.ts', '../index.ts'],
        sourcesContent: ['first', 'conflict'],
        mappings: 'AAAA',
      },
    ]) {
      writeFileSync(mapPath, JSON.stringify(upstream));
      expect(() => validateRequestRuntimeBuild(directory, result)).toThrow();
    }
    for (let i = 0; i < 6; i++) {
      const source =
        i === 0 ? input : path.join(path.dirname(input), `layer${i}.js`);
      writeFileSync(
        source,
        `module.exports = {};\n//# sourceMappingURL=${path.basename(source)}.map`,
      );
      writeFileSync(
        `${source}.map`,
        JSON.stringify({
          version: 3,
          sources: [`layer${i + 1}.js`],
          mappings: 'AAAA',
        }),
      );
    }
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow();
    writeFileSync(mapPath, ' '.repeat(16 * 1024 * 1024 + 1));
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow();
  });

  it('bounds wide local map chains as well as recursive chains', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result } = fixture();
    const vendor = path.join(directory, 'node_modules/ts-jsonapi/lib');
    writeFileSync(
      path.join(vendor, 'index.js'),
      'module.exports = {};\n//# sourceMappingURL=index.js.map',
    );
    const mapFile = result.outputFiles?.find((file) =>
      file.path.endsWith('.map'),
    );
    if (!mapFile) throw new Error('Missing fixture map');
    const composed = JSON.parse(Buffer.from(mapFile.contents).toString('utf8'));
    const index = composed.sources.indexOf(
      '../../../node_modules/ts-jsonapi/lib/index.js',
    );
    composed.sources.splice(index, 1);
    composed.sourcesContent.splice(index, 1);
    const children = Array.from({ length: 128 }, (_, i) => `child${i}.js`);
    writeFileSync(
      path.join(vendor, 'index.js.map'),
      JSON.stringify({ version: 3, sources: children, mappings: 'AAAA' }),
    );
    for (const [i, child] of children.entries()) {
      writeFileSync(
        path.join(vendor, child),
        `module.exports = {};\n//# sourceMappingURL=${child}.map`,
      );
      writeFileSync(
        path.join(vendor, `${child}.map`),
        JSON.stringify({
          version: 3,
          sources: [`leaf${i}.ts`],
          mappings: 'AAAA',
        }),
      );
      composed.sources.push(`../../../node_modules/ts-jsonapi/lib/leaf${i}.ts`);
      composed.sourcesContent.push(null);
    }
    mapFile.contents = Buffer.from(JSON.stringify(composed));
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
      'Source-map count limit exceeded',
    );
  });

  it('rejects extra JavaScript outputs rather than claiming one network payload', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result, outputPath } = fixture();
    result.outputFiles?.push({
      path: outputPath.replace('.js', '.extra.js'),
      text: '',
      contents: Buffer.from(''),
      hash: '',
    });
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
      'one JavaScript artifact',
    );
  });

  it('rejects external imports and incomplete canonical exports', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result } = fixture();
    const output =
      result.metafile?.outputs[
        'packages/serializers/dist/request-runtime.bundle.js'
      ];
    if (!output) throw new Error('Missing fixture output');
    output.imports.push({
      path: 'node:buffer',
      kind: 'import-statement',
      external: true,
    });
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
      'closed ESM',
    );
    output.imports = [];
    output.exports = names.slice(1);
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
      '21 canonical exports',
    );
  });

  it('fails closed when original source maps are missing, omitted or altered', async () => {
    const { validateRequestRuntimeBuild } = await import(
      './build-request-serializers'
    );
    const { directory, result } = fixture();
    const mapFile = result.outputFiles?.find((file) =>
      file.path.endsWith('.map'),
    );
    if (!mapFile) throw new Error('Missing fixture map');
    for (const map of [
      { version: 3, sources: [], sourcesContent: [] },
      {
        version: 3,
        sources: ['../src/server/ingredients/image.serializer.ts'],
        sourcesContent: ['copied implementation'],
      },
    ]) {
      mapFile.contents = Buffer.from(JSON.stringify(map));
      expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
        'original source',
      );
    }
    result.outputFiles = result.outputFiles?.filter(
      (file) => !file.path.endsWith('.map'),
    );
    expect(() => validateRequestRuntimeBuild(directory, result)).toThrow(
      'source map',
    );
  });
});
