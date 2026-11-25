import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

interface PruneAppShell {
  listTracedSourceFiles(serverDirectory: string): string[];
  pruneBuildTraceFiles(directory: string): number;
  compactBuildJson(nextDirectory: string): number;
  pruneFullSegmentPayloads(serverDirectory: string): number;
  pruneTracedSourceFiles(serverDirectory: string): number;
  pruneUnusedBuildFiles(serverRoot: string): number;
  pruneUnusedNextRuntimeFiles(nodeModulesRoot: string): number;
}

const require = createRequire(import.meta.url);
const prune = require('../../scripts/prune-app-shell.cjs') as PruneAppShell;

describe('desktop app shell pruning', () => {
  let root = '';

  const write = (relativePath: string, content: string): string => {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
    return absolutePath;
  };

  const read = (relativePath: string): string =>
    fs.readFileSync(path.join(root, relativePath), 'utf8');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-app-shell-'));
  });

  afterEach(() => {
    fs.rmSync(root, { force: true, recursive: true });
  });

  it('removes traced TypeScript sources and keeps compiled output and assets', () => {
    write('src/features/Foo.tsx', 'export {};');
    write('src/lib/util.ts', 'export {};');
    write('app/(protected)/page.tsx', 'export {};');
    write('tests/helper.mts', 'export {};');
    write('src/types.d.ts', 'declare const x: number;');
    write('src/styles/global.css', 'body {}');
    write('messages/en/common.json', '{}');
    write('public/assets/logo.png', 'png');
    write('.next/server/app/page.js', 'compiled');

    const removedBytes = prune.pruneTracedSourceFiles(root);

    expect(removedBytes).toBe(4 * 'export {};'.length);
    expect(
      fs.readdirSync(path.join(root, 'src'), { recursive: true }).sort(),
    ).toEqual(['features', 'lib', 'styles', 'styles/global.css', 'types.d.ts']);
    expect(fs.existsSync(path.join(root, 'messages/en/common.json'))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(root, 'public/assets/logo.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.next/server/app/page.js'))).toBe(
      true,
    );
  });

  it('lists the traced sources the pruner would remove', () => {
    const kept = write('src/types.d.ts', 'declare const x: number;');
    const leaked = write('src/features/Foo.tsx', 'export {};');

    expect(prune.listTracedSourceFiles(root)).toEqual([leaked]);

    prune.pruneTracedSourceFiles(root);

    expect(prune.listTracedSourceFiles(root)).toEqual([]);
    expect(fs.existsSync(kept)).toBe(true);
  });

  it('removes build-time file-trace lists only', () => {
    write('.next/server/app/page.js.nft.json', '{"files":[]}');
    write('.next/server/app/page.js', 'compiled');

    expect(prune.pruneBuildTraceFiles(path.join(root, '.next'))).toBe(
      '{"files":[]}'.length,
    );
    expect(fs.readdirSync(path.join(root, '.next/server/app')).sort()).toEqual([
      'page.js',
    ]);
  });

  it("removes Next's unused font metrics table and nothing else", () => {
    write('next/dist/server/capsize-font-metrics.json', '{}');
    write('next/dist/server/font-utils.js', 'module.exports = {};');
    write('next/dist/server/next-server.js', 'module.exports = {};');

    expect(prune.pruneUnusedNextRuntimeFiles(root)).toBe(
      '{}'.length + 'module.exports = {};'.length,
    );
    expect(fs.readdirSync(path.join(root, 'next/dist/server'))).toEqual([
      'next-server.js',
    ]);
  });

  it('removes the edge runtime, the unused app page runtime and non-Node React server builds', () => {
    write('next/dist/compiled/edge-runtime/index.js', 'edge');
    write('next/dist/compiled/edge-runtime/package.json', '{}');
    write(
      'next/dist/compiled/next-server/app-page-turbo.runtime.prod.js',
      'plain',
    );
    write(
      'next/dist/compiled/next-server/app-page-turbo-experimental.runtime.prod.js',
      'experimental',
    );
    write('next/dist/compiled/@edge-runtime/primitives/load.js', 'primitives');
    write('react-dom/cjs/react-dom-server.browser.production.js', 'browser');
    write('react-dom/cjs/react-dom-server.edge.production.js', 'edge');
    write(
      'react-dom/cjs/react-dom-server-legacy.browser.production.js',
      'legacy-browser',
    );
    write('react-dom/cjs/react-dom-server.node.production.js', 'node');

    expect(prune.pruneUnusedNextRuntimeFiles(root)).toBe(
      'edge'.length +
        '{}'.length +
        'plain'.length +
        'browser'.length +
        'edge'.length +
        'legacy-browser'.length,
    );
    expect(
      fs
        .readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual([
      'app-page-turbo-experimental.runtime.prod.js',
      'load.js',
      'react-dom-server.node.production.js',
    ]);
  });

  it('removes the service worker source map body and keeps the worker', () => {
    write('.next/server/app/serwist/sw.js.map.body', 'map');
    write('.next/server/app/serwist/sw.js.body', 'worker');

    expect(prune.pruneUnusedBuildFiles(root)).toBe('map'.length);
    expect(fs.readdirSync(path.join(root, '.next/server/app/serwist'))).toEqual(
      ['sw.js.body'],
    );
  });

  it('removes full-page segment payloads only where the HTML does not request them', () => {
    const app = '.next/server/app';
    write(`${app}/plain.html`, '<html/>');
    write(`${app}/plain.segments/_tree.segment.rsc`, 'tree');
    write(`${app}/plain.segments/_full.segment.rsc`, 'full');
    write(`${app}/plain.segments/!KHB1YmxpYyk/__PAGE__.segment.rsc`, 'page');
    write(
      `${app}/(protected)/[slug].html`,
      '<script>__NEXT_CLIENT_RESUME=fetch("/")</script>',
    );
    write(`${app}/(protected)/[slug].segments/_full.segment.rsc`, 'kept');
    write(`${app}/(protected)/admin.segments/_full.segment.rsc`, 'orphan');

    expect(prune.pruneFullSegmentPayloads(root)).toBe('full'.length);
    expect(
      fs
        .readdirSync(path.join(root, app), { recursive: true })
        .map(String)
        .filter((name) => name.endsWith('.rsc'))
        .sort(),
    ).toEqual([
      '(protected)/[slug].segments/_full.segment.rsc',
      '(protected)/admin.segments/_full.segment.rsc',
      'plain.segments/!KHB1YmxpYyk/__PAGE__.segment.rsc',
      'plain.segments/_tree.segment.rsc',
    ]);
  });

  it('skips the full-page segment prune when there is no app output', () => {
    expect(prune.pruneFullSegmentPayloads(root)).toBe(0);
  });

  it('compacts parseable build JSON and leaves everything else alone', () => {
    write('.next/routes-manifest.json', '{\n  "a": [\n    1,\n    2\n  ]\n}');
    write('.next/server/app/page.meta', '{\n  "status": 200\n}');
    write('.next/server/broken.json', '{ not json');
    write('.next/server/already.json', '{"a":1}');
    write('.next/server/page.js', 'const a = {\n  b: 1\n};');

    expect(prune.compactBuildJson(path.join(root, '.next'))).toBe(
      '{\n  "a": [\n    1,\n    2\n  ]\n}'.length -
        '{"a":[1,2]}'.length +
        '{\n  "status": 200\n}'.length -
        '{"status":200}'.length,
    );
    expect(read('.next/routes-manifest.json')).toBe('{"a":[1,2]}');
    expect(read('.next/server/app/page.meta')).toBe('{"status":200}');
    expect(read('.next/server/broken.json')).toBe('{ not json');
    expect(read('.next/server/page.js')).toBe('const a = {\n  b: 1\n};');
  });

  it('skips compaction when the build directory is missing', () => {
    expect(prune.compactBuildJson(path.join(root, '.next'))).toBe(0);
  });
});
