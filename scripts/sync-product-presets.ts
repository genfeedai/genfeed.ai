#!/usr/bin/env bun
/**
 * Pins the public presets repository into the monorepo.
 *
 *   bun scripts/sync-product-presets.ts <path to a clean genfeedai/catalog checkout> <40-character commit>
 *   bun scripts/sync-product-presets.ts --check
 *   bun scripts/sync-product-presets.ts --missing-examples
 *
 * It copies the catalog's `presets/catalog.json` and every `presets/<group>/<key>/preset.json`
 * into this repository's `presets/`,
 * records the commit and a SHA-256 per file in `presets/catalog.lock.json`, and
 * generates `packages/contracts/src/constants/preset-catalog.generated.ts`, the
 * typed data the app seed, the studio and the shop sync read. `--check` fails when
 * the pinned files, the lock or the generated file disagree. `--missing-examples` lists the presets that have no example
 * media yet (it never fails). Change a preset in
 * genfeedai/catalog, then run this again with the new commit.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { presetExampleProblems } from '../packages/contracts/src/constants/preset-example.constant';

export const SOURCE_REPOSITORY = 'https://github.com/genfeedai/catalog';
/** The folder of the catalog repository that holds the presets. */
const SOURCE_PRESETS_FOLDER = 'presets';
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const SAFE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINNED_DIRECTORY = join(ROOT, 'presets');
const LOCK_FILE = join(PINNED_DIRECTORY, 'catalog.lock.json');
const GENERATED_FILE = join(
  ROOT,
  'packages/contracts/src/constants/preset-catalog.generated.ts',
);

/** Exported name of the map from a preset key to its example media. */
const EXAMPLES_EXPORT = 'PRESET_EXAMPLE_DATA';

/** The group a preset lives in, and the exported name of its array. */
const GROUP_EXPORTS = {
  ad: 'AD_PRESET_DATA',
  b2b: 'B2B_PLAYBOOK_DATA',
  cinematic: 'CINEMATIC_SHORT_DATA',
  studio: 'STUDIO_SYSTEM_PRESET_DATA',
} as const;
type Group = keyof typeof GROUP_EXPORTS;
const GROUPS = Object.keys(GROUP_EXPORTS) as Group[];

export interface PresetCatalogFile {
  groups: Record<Group, string[]>;
}

export interface PresetCatalogLock {
  files: Array<{ path: string; sha256: string }>;
  schemaVersion: 1;
  sourceCommit: string;
  sourceCommittedAt: string;
  sourceRepository: string;
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function git(source: string, ...args: string[]): string {
  return execFileSync('git', ['-C', source, ...args], {
    encoding: 'utf8',
  }).trim();
}

function validateSource(source: string, commit: string): string {
  if (!GIT_SHA_PATTERN.test(commit))
    throw new Error('A full source commit SHA is required');
  if (
    realpathSync(git(source, 'rev-parse', '--show-toplevel')) !==
    realpathSync(source)
  )
    throw new Error('Source directory must be the repository root');
  const origin = git(source, 'remote', 'get-url', 'origin');
  if (![SOURCE_REPOSITORY, `${SOURCE_REPOSITORY}.git`].includes(origin))
    throw new Error('Wrong source repository');
  if (git(source, 'rev-parse', 'HEAD') !== commit)
    throw new Error('Wrong source revision');
  if (git(source, 'status', '--porcelain', '--untracked-files=all'))
    throw new Error('Source checkout must be clean');
  return new Date(
    git(source, 'show', '-s', '--format=%cI', commit),
  ).toISOString();
}

function parseCatalog(text: string): PresetCatalogFile {
  const parsed = JSON.parse(text) as Partial<PresetCatalogFile>;
  const groups = {} as Record<Group, string[]>;
  for (const group of GROUPS) {
    const keys = parsed.groups?.[group];
    if (!Array.isArray(keys) || keys.length === 0)
      throw new Error(`catalog.json lists no presets for ${group}`);
    for (const key of keys) {
      if (typeof key !== 'string' || !SAFE_NAME_PATTERN.test(key))
        throw new Error(`Unsafe preset key in ${group}: ${String(key)}`);
    }
    if (new Set(keys).size !== keys.length)
      throw new Error(`catalog.json lists a key twice in ${group}`);
    groups[group] = keys;
  }
  if (Object.keys(parsed.groups ?? {}).length !== GROUPS.length)
    throw new Error('catalog.json has a group this script does not know');
  return { groups };
}

function presetPath(group: Group, key: string): string {
  return `${group}/${key}/preset.json`;
}

/** The generated module for a pinned catalog: one `as const` array per group, in catalog order. */
export function renderGenerated(
  catalog: PresetCatalogFile,
  commit: string,
  readPreset: (path: string) => string,
): string {
  const examples: Record<string, unknown> = {};
  const blocks = GROUPS.map((group) => {
    const items = catalog.groups[group].map((key) => {
      const { examples: presetExamples, ...preset } = JSON.parse(
        readPreset(presetPath(group, key)),
      ) as {
        examples?: unknown;
        key?: unknown;
        mediaType?: unknown;
        type?: unknown;
      };
      if (preset.key !== key)
        throw new Error(`${presetPath(group, key)}: key must match the folder`);
      const problems = presetExampleProblems(
        outputTypeOf(group, preset),
        presetExamples,
      );
      if (problems.length > 0)
        throw new Error(`${presetPath(group, key)}: ${problems.join('; ')}`);
      if (Array.isArray(presetExamples) && presetExamples.length > 0)
        examples[key] = presetExamples;
      return preset;
    });
    return `export const ${GROUP_EXPORTS[group]} = ${JSON.stringify(items, null, 2)} as const;\n`;
  });
  blocks.push(
    `export const ${EXAMPLES_EXPORT}: Readonly<Record<string, readonly PresetExample[]>> = ${JSON.stringify(examples, null, 2)};\n`,
  );
  return [
    '// biome-ignore-all lint: generated file',
    '// biome-ignore-all format: generated file',
    `// Generated by scripts/sync-product-presets.ts from genfeedai/catalog@${commit}.`,
    '// Do not edit. Change the preset in that repository, then run `bun run presets:sync`.',
    '',
    "import type { PresetExample } from '../interfaces/elements/preset-example.interface';",
    '',
    ...blocks,
  ].join('\n');
}

/** What a preset makes: a video, a picture or an edited photo. */
function outputTypeOf(
  group: Group,
  preset: { mediaType?: unknown; type?: unknown },
): 'image' | 'image-edit' | 'video' {
  if (group === 'ad' || group === 'cinematic') return 'video';
  const type = group === 'b2b' ? preset.mediaType : preset.type;
  if (type === 'image' || type === 'image-edit' || type === 'video')
    return type;
  throw new Error(`A ${group} preset must say what it makes`);
}

function listPinnedFiles(): string[] {
  const files: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(PINNED_DIRECTORY, relative)).sort()) {
      const entryPath = relative ? `${relative}/${entry}` : entry;
      if (statSync(join(PINNED_DIRECTORY, entryPath)).isDirectory())
        walk(entryPath);
      else files.push(entryPath);
    }
  };
  walk('');
  return files.filter((file) => file !== 'catalog.lock.json');
}

function expectedFiles(catalog: PresetCatalogFile): string[] {
  return [
    'catalog.json',
    ...GROUPS.flatMap((group) =>
      catalog.groups[group].map((key) => presetPath(group, key)),
    ),
  ].sort();
}

/** Throws when the pinned files, the lock and the generated module disagree. */
export function checkPins(): void {
  const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf8')) as PresetCatalogLock;
  if (lock.schemaVersion !== 1) throw new Error('Unknown lock version');
  if (lock.sourceRepository !== SOURCE_REPOSITORY)
    throw new Error('Lock names the wrong source repository');
  if (!GIT_SHA_PATTERN.test(lock.sourceCommit))
    throw new Error('Lock has no source commit');

  const catalog = parseCatalog(
    readFileSync(join(PINNED_DIRECTORY, 'catalog.json'), 'utf8'),
  );
  const onDisk = listPinnedFiles();
  const expected = expectedFiles(catalog);
  if (JSON.stringify(onDisk) !== JSON.stringify(expected))
    throw new Error(
      `presets/ holds ${onDisk.length} files; catalog.json lists ${expected.length}. Run bun run presets:sync.`,
    );
  if (
    JSON.stringify(lock.files.map((file) => file.path)) !==
    JSON.stringify(expected)
  )
    throw new Error('The lock does not list the same files as catalog.json');
  for (const file of lock.files) {
    if (sha256(readFileSync(join(PINNED_DIRECTORY, file.path))) !== file.sha256)
      throw new Error(`${file.path} was edited after it was pinned`);
  }

  const generated = renderGenerated(catalog, lock.sourceCommit, (path) =>
    readFileSync(join(PINNED_DIRECTORY, path), 'utf8'),
  );
  if (readFileSync(GENERATED_FILE, 'utf8') !== generated)
    throw new Error(
      'preset-catalog.generated.ts does not match presets/. Run bun run presets:sync.',
    );
}

/** Keys of the pinned presets that carry no example media. */
export function listPresetsWithoutExample(): string[] {
  const catalog = parseCatalog(
    readFileSync(join(PINNED_DIRECTORY, 'catalog.json'), 'utf8'),
  );
  return GROUPS.flatMap((group) => catalog.groups[group]).filter((key) => {
    const group = GROUPS.find((candidate) =>
      catalog.groups[candidate].includes(key),
    ) as Group;
    const preset = JSON.parse(
      readFileSync(join(PINNED_DIRECTORY, presetPath(group, key)), 'utf8'),
    ) as { examples?: unknown[] };
    return !preset.examples || preset.examples.length === 0;
  });
}

export function syncPresets(source: string, commit: string): number {
  const sourceCommittedAt = validateSource(source, commit);
  const catalogText = readFileSync(
    join(source, SOURCE_PRESETS_FOLDER, 'catalog.json'),
    'utf8',
  );
  const catalog = parseCatalog(catalogText);

  rmSync(PINNED_DIRECTORY, { force: true, recursive: true });
  const files = new Map<string, Buffer>([
    ['catalog.json', Buffer.from(catalogText)],
  ]);
  for (const group of GROUPS) {
    for (const key of catalog.groups[group]) {
      const path = presetPath(group, key);
      if (!existsSync(join(source, SOURCE_PRESETS_FOLDER, path)))
        throw new Error(`${path} is listed in catalog.json but missing`);
      files.set(path, readFileSync(join(source, SOURCE_PRESETS_FOLDER, path)));
    }
  }
  for (const [path, content] of files) {
    mkdirSync(dirname(join(PINNED_DIRECTORY, path)), { recursive: true });
    writeFileSync(join(PINNED_DIRECTORY, path), content);
  }

  const lock: PresetCatalogLock = {
    files: [...files.keys()]
      .sort()
      .map((path) => ({ path, sha256: sha256(files.get(path) as Buffer) })),
    schemaVersion: 1,
    sourceCommit: commit,
    sourceCommittedAt,
    sourceRepository: SOURCE_REPOSITORY,
  };
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  writeFileSync(
    GENERATED_FILE,
    renderGenerated(catalog, commit, (path) =>
      (files.get(path) as Buffer).toString('utf8'),
    ),
  );
  checkPins();
  return files.size - 1;
}

if (import.meta.main) {
  const [first, second] = process.argv.slice(2);
  if (first === '--missing-examples') {
    const missing = listPresetsWithoutExample();
    process.stdout.write(
      missing.length === 0
        ? 'Every preset has an example\n'
        : `${missing.length} presets have no example:\n${missing.join('\n')}\n`,
    );
  } else if (first === '--check') {
    checkPins();
    process.stdout.write('Preset pin is consistent\n');
  } else if (first && second) {
    const count = syncPresets(resolve(first), second);
    process.stdout.write(`Pinned ${count} presets at ${second}\n`);
  } else {
    process.stderr.write(
      'Usage: sync-product-presets.ts <source checkout> <commit> | --check | --missing-examples\n',
    );
    process.exit(1);
  }
}
