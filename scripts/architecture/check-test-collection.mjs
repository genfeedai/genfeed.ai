#!/usr/bin/env node

/**
 * Guard: every test file must be collected by a runner (#2687).
 *
 * A green suite says nothing about files it never collected. #2673 found this
 * four times (notifications excludes, a pages allowlist that missed half the
 * suite, a files `.test.ts` next to a `*.spec.ts` include). This guard walks
 * first-party test files and requires each one to match at least one parsed
 * Vitest include, Playwright spec tree, Bun-runner script, or node:test glob.
 *
 * Parsing is source-level on purpose: the architecture job already has the
 * repo on disk, and executing every Vitest config would pull the whole
 * package graph. Unparseable configs fall back to Vitest's default include
 * (both `*.test` and `*.spec`) so a missing include cannot invent orphans.
 * An explicit narrower include is what this guard is for.
 *
 * Usage:
 *   node scripts/architecture/check-test-collection.mjs
 *   bun run check:test-collection
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const TEST_FILE_PATTERN = /\.(?:test|spec|e2e-spec|e2e\.test)\.[cm]?[jt]sx?$/;

const IGNORE_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vitest-reports',
  'coverage',
  'coverage-cron',
  'dist',
  'generated',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const VITEST_CONFIG_PATTERN =
  /^vitest(?:\.[a-z0-9-]+)?\.config(?:\.[a-z0-9-]+)?\.[cm]?[jt]s$/;

/**
 * Vitest 4 default include, expanded so the source parser does not need
 * extglob. `*.e2e-spec` is a Nest convention, not a Vitest default.
 *
 * @type {string[]}
 */
export const DEFAULT_VITEST_INCLUDES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.test.mts',
  '**/*.test.cts',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.test.mjs',
  '**/*.test.cjs',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.spec.mts',
  '**/*.spec.cts',
  '**/*.spec.js',
  '**/*.spec.jsx',
  '**/*.spec.mjs',
  '**/*.spec.cjs',
];

const DEFAULT_VITEST_CONFIG_PATTERN = /^vitest\.config\.[cm]?[jt]s$/;
const VITEST_CONFIG_FLAG_PATTERN = /--config(?:=|\s+)['"]?([^\s'"]+)['"]?/g;
const PACKAGE_JSON_NAME = 'package.json';

/**
 * Reviewed extras that are not Vitest configs. Each entry is a collector the
 * repository actually runs in CI or a package script.
 *
 * @type {Array<{ id: string, root: string, includes: string[], excludes?: string[] }>}
 */
export const STATIC_COLLECTORS = [
  {
    id: 'playwright-e2e',
    root: 'playwright',
    includes: ['e2e/tests/**/*.spec.ts', 'e2e/**/*.setup.ts'],
  },
  {
    id: 'node-test-scripts',
    root: '.',
    includes: ['scripts/**/*.test.mjs'],
  },
  {
    id: 'desktop-bun-test',
    root: 'apps/desktop/app',
    includes: ['src/**/*.test.ts'],
  },
  {
    id: 'ide-extension-bun-test',
    root: 'apps/extensions/ide/app',
    includes: ['src/**/*.test.ts'],
    excludes: ['src/**/*.e2e.test.ts'],
  },
];

/**
 * Intentional uncollected files. Every row needs a tracking issue.
 * Keep this empty unless a file is a fixture, a disabled suite, or a
 * runner the guard cannot see yet.
 *
 * @type {Array<{ file: string, reason: string, trackingIssue: number }>}
 */
export const TEST_COLLECTION_ALLOWLIST = [
  {
    file: 'apps/server/mcp/test/app.e2e-spec.ts',
    reason:
      'Nest e2e scaffold is not in the mcp Vitest include; test:e2e reuses the unit config.',
    trackingIssue: 2687,
  },
];

const TEST_COLLECTION_ALLOWLIST_FILES = new Set(
  TEST_COLLECTION_ALLOWLIST.map((entry) => entry.file),
);

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegExp(pattern) {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      const after = pattern[index + 2];
      if (after === '/') {
        source += '(?:.*/)?';
        index += 2;
        continue;
      }
      source += '.*';
      index += 1;
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    if (character === '{') {
      const close = pattern.indexOf('}', index);
      if (close === -1) {
        source += '\\{';
        continue;
      }
      const body = pattern.slice(index + 1, close);
      source += `(?:${body.split(',').map(escapeRegExp).join('|')})`;
      index = close;
      continue;
    }
    source += escapeRegExp(character);
  }
  return new RegExp(`^${source}$`);
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

/**
 * @param {string} file
 * @param {string} pattern
 * @returns {boolean}
 */
export function matchGlob(file, pattern) {
  const normalized = file.replaceAll('\\', '/');
  return globToRegExp(pattern).test(normalized);
}

/**
 * @param {string} source
 * @param {number} openIndex
 * @returns {string}
 */
export function readBalancedBlock(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex, index + 1);
      }
    }
  }
  return source.slice(openIndex);
}

/**
 * @param {string} source
 * @returns {string[]}
 */
/**
 * Remove a named `{ ... }` property so nested coverage include/exclude
 * arrays cannot be mistaken for the test-file globs.
 *
 * @param {string} source
 * @param {string} name
 * @returns {string}
 */
export function stripNamedObjectBlock(source, name) {
  const pattern = new RegExp(`\\b${name}\\s*:\\s*\\{`);
  let result = source;
  let match = pattern.exec(result);

  while (match) {
    const openIndex = match.index + match[0].length - 1;
    const block = readBalancedBlock(result, openIndex);
    result = `${result.slice(0, match.index)}${result.slice(openIndex + block.length)}`;
    pattern.lastIndex = 0;
    match = pattern.exec(result);
  }

  return result;
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function readQuotedStrings(source) {
  return [...source.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

/**
 * Extract `include` / `exclude` arrays that are direct children of `test: {`,
 * skipping the nested `coverage: { }` block so coverage source globs cannot
 * hide or invent test files.
 *
 * @param {string} source
 * @returns {{ includes: string[], excludes: string[] }}
 */
export function extractVitestTestGlobs(source) {
  const includes = [];
  const excludes = [];
  const testProperty = /\btest\s*:\s*\{/g;
  let match = testProperty.exec(source);

  while (match) {
    const block = readBalancedBlock(source, match.index + match[0].length - 1);
    const withoutCoverage = stripNamedObjectBlock(block, 'coverage');
    const includeMatch = withoutCoverage.match(
      /\binclude\s*:\s*\[([\s\S]*?)\]/,
    );
    const excludeMatch = withoutCoverage.match(
      /\bexclude\s*:\s*\[([\s\S]*?)\]/,
    );

    if (includeMatch) {
      includes.push(...readQuotedStrings(includeMatch[1]));
    }
    if (excludeMatch) {
      excludes.push(...readQuotedStrings(excludeMatch[1]));
    }

    match = testProperty.exec(source);
  }

  return {
    includes: includes.length > 0 ? includes : [...DEFAULT_VITEST_INCLUDES],
    excludes,
  };
}

/**
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listTestFiles(rootDir) {
  const files = [];

  /**
   * @param {string} directory
   * @param {string} relativeDirectory
   */
  function walk(directory, relativeDirectory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRECTORY_NAMES.has(entry.name)) continue;
        walk(
          path.join(directory, entry.name),
          relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
        );
        continue;
      }

      if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) continue;
      files.push(
        relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
      );
    }
  }

  walk(rootDir, '');
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listVitestConfigFiles(rootDir) {
  const files = [];

  /**
   * @param {string} directory
   * @param {string} relativeDirectory
   */
  function walk(directory, relativeDirectory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRECTORY_NAMES.has(entry.name)) continue;
        walk(
          path.join(directory, entry.name),
          relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
        );
        continue;
      }

      if (!entry.isFile() || !VITEST_CONFIG_PATTERN.test(entry.name)) continue;
      files.push(
        relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
      );
    }
  }

  walk(rootDir, '');
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * @param {string} file
 * @param {string} root
 * @returns {string | null}
 */
export function relativizeToRoot(file, root) {
  const normalizedFile = file.replaceAll('\\', '/');
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, '');
  if (normalizedRoot === '.' || normalizedRoot === '') return normalizedFile;
  if (normalizedFile === normalizedRoot) return '';
  const prefix = `${normalizedRoot}/`;
  if (!normalizedFile.startsWith(prefix)) return null;
  return normalizedFile.slice(prefix.length);
}

/**
 * @param {{ root: string, includes: string[], excludes?: string[] }} collector
 * @param {string} file
 * @returns {boolean}
 */
export function collectorMatches(collector, file) {
  const relative = relativizeToRoot(file, collector.root);
  if (relative === null) return false;
  const included = collector.includes.some((pattern) =>
    matchGlob(relative, pattern),
  );
  if (!included) return false;
  const excluded = (collector.excludes ?? []).some((pattern) =>
    matchGlob(relative, pattern),
  );
  return !excluded;
}

/**
 * @param {string} source
 * @returns {string[]}
 */
const VITEST_PROJECT_PATH_PATTERN =
  /vitest(?:\.[a-z0-9*-]+)?\.config(?:\.[a-z0-9-]+)?\.[cm]?[jt]s$/;

export function extractVitestProjectGlobs(source) {
  const inline = source.match(/\bprojects\s*:\s*\[([\s\S]*?)\]/);
  if (inline) {
    return readQuotedStrings(inline[1]);
  }

  if (!/\bprojects\s*:/.test(source)) {
    return [];
  }

  return readQuotedStrings(source).filter((value) =>
    VITEST_PROJECT_PATH_PATTERN.test(value),
  );
}

/**
 * @param {string} rootDir
 * @param {string} relativeDirectory
 * @param {(name: string) => boolean} isMatch
 * @returns {string[]}
 */
function listFilesByName(rootDir, relativeDirectory, isMatch) {
  const files = [];

  /**
   * @param {string} directory
   * @param {string} relative
   */
  function walk(directory, relative) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORE_DIRECTORY_NAMES.has(entry.name)) continue;
        walk(path.join(directory, entry.name), nextRelative);
        continue;
      }
      if (entry.isFile() && isMatch(entry.name)) {
        files.push(nextRelative);
      }
    }
  }

  walk(
    relativeDirectory ? path.join(rootDir, relativeDirectory) : rootDir,
    relativeDirectory,
  );
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * @param {string} rootDir
 * @returns {Array<{ cwd: string, text: string }>}
 */
export function listExecutableRunnerCommands(rootDir) {
  const records = [];

  for (const file of listFilesByName(
    rootDir,
    '',
    (name) => name === PACKAGE_JSON_NAME,
  )) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(path.join(rootDir, file), 'utf8'));
    } catch {
      continue;
    }

    const cwd = path.posix.dirname(file.replaceAll('\\', '/'));
    for (const text of Object.values(pkg.scripts ?? {})) {
      if (typeof text === 'string' && text.length > 0) {
        records.push({ cwd: cwd === '.' ? '' : cwd, text });
      }
    }
  }

  for (const file of listFilesByName(rootDir, '.github/workflows', (name) =>
    /\.ya?ml$/.test(name),
  )) {
    records.push({
      cwd: '',
      text: readFileSync(path.join(rootDir, file), 'utf8'),
    });
  }

  return records;
}

/**
 * @param {{ cwd: string, text: string }} record
 * @returns {string[]}
 */
export function resolveCommandConfigPaths(record) {
  const paths = new Set();
  let cwd = record.cwd;

  for (const segment of record.text.split(/\n|&&|;/)) {
    const cdMatch = segment.match(/^\s*cd\s+(\S+)/);
    if (cdMatch) {
      cwd = path.posix.normalize(
        path.posix.join(record.cwd || '.', cdMatch[1]),
      );
      if (cwd === '.') cwd = '';
    }

    VITEST_CONFIG_FLAG_PATTERN.lastIndex = 0;
    let match = VITEST_CONFIG_FLAG_PATTERN.exec(segment);
    while (match) {
      const resolved = path.posix.normalize(
        path.posix.join(cwd || '.', match[1]),
      );
      paths.add(resolved === '.' ? match[1] : resolved);
      match = VITEST_CONFIG_FLAG_PATTERN.exec(segment);
    }
  }

  return [...paths];
}

/**
 * @param {string} rootDir
 * @param {string[]} configFiles
 * @returns {Set<string>}
 */
export function listReferencedVitestConfigFiles(rootDir, configFiles) {
  const referenced = new Set();
  const configSet = new Set(configFiles);

  for (const record of listExecutableRunnerCommands(rootDir)) {
    for (const configPath of resolveCommandConfigPaths(record)) {
      if (configSet.has(configPath)) {
        referenced.add(configPath);
      }
    }

    if (/\bvitest\b/.test(record.text) && !/--config\b/.test(record.text)) {
      for (const configFile of configFiles) {
        const directory = path.posix.dirname(configFile);
        const basename = path.posix.basename(configFile);
        const packageDir = record.cwd === '' ? '.' : record.cwd;
        if (
          directory === packageDir &&
          DEFAULT_VITEST_CONFIG_PATTERN.test(basename)
        ) {
          referenced.add(configFile);
        }
      }
    }
  }

  const pending = [...referenced];
  while (pending.length > 0) {
    const configFile = pending.pop();
    if (!configFile) continue;
    let source;
    try {
      source = readFileSync(path.join(rootDir, configFile), 'utf8');
    } catch {
      continue;
    }

    const configDir = path.posix.dirname(configFile);
    for (const pattern of extractVitestProjectGlobs(source)) {
      const resolvedPattern = path.posix.normalize(
        path.posix.join(configDir === '.' ? '' : configDir, pattern),
      );
      for (const candidate of configFiles) {
        if (referenced.has(candidate)) continue;
        if (matchGlob(candidate, resolvedPattern)) {
          referenced.add(candidate);
          pending.push(candidate);
        }
      }
    }
  }

  return referenced;
}

/**
 * @param {string} rootDir
 * @returns {Array<{ id: string, root: string, includes: string[], excludes?: string[] }>}
 */
export function loadVitestCollectors(rootDir) {
  const configFiles = listVitestConfigFiles(rootDir);
  const referenced = listReferencedVitestConfigFiles(rootDir, configFiles);

  return configFiles
    .filter((configFile) => referenced.has(configFile))
    .map((configFile) => {
      const source = readFileSync(path.join(rootDir, configFile), 'utf8');
      const globs = extractVitestTestGlobs(source);
      return {
        id: configFile,
        root: path.posix.dirname(configFile.replaceAll('\\', '/')),
        includes: globs.includes,
        excludes: globs.excludes,
      };
    });
}

/**
 * @param {string} [rootDir]
 * @returns {{ file: string, collectors: string[] }[]}
 */
export function findUncollectedTestFiles(rootDir = REPOSITORY_ROOT) {
  const collectors = [...loadVitestCollectors(rootDir), ...STATIC_COLLECTORS];
  const files = listTestFiles(rootDir);

  return files
    .filter((file) => !TEST_COLLECTION_ALLOWLIST_FILES.has(file))
    .map((file) => ({
      collectors: collectors
        .filter((collector) => collectorMatches(collector, file))
        .map((collector) => collector.id),
      file,
    }))
    .filter((entry) => entry.collectors.length === 0);
}

function isMainModule() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return (
      path.resolve(invoked) === fileURLToPath(import.meta.url) ||
      statSync(invoked).ino === statSync(fileURLToPath(import.meta.url)).ino
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const orphans = findUncollectedTestFiles();

  if (orphans.length > 0) {
    console.error(
      'Test files matched by no runner. A green suite does not cover these:',
    );
    for (const orphan of orphans) {
      console.error(`- ${orphan.file}`);
    }
    console.error(
      '\nCollect them (widen include, add a second config, or rename to the workspace convention) or add a reviewed allowlist row with a tracking issue.',
    );
    process.exit(1);
  }

  console.log('Test collection guard passed.');
}
