#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  assertSafePath,
  catalogSkillDirectories,
  compileSkill,
  createCatalogLock,
  inventory,
  SOURCE_REPOSITORY,
  UPSTREAM_SLUGS,
  validateCatalogLock,
} from '../apps/server/api/src/collections/skills/catalog/skill-catalog-artifact';
import { renderSkillsReadme } from './check-skills-readme-drift';
import { renderSkillsIndex } from './generate-skills-index';

function git(source: string, ...args: string[]): string {
  return execFileSync('git', ['-C', source, ...args], {
    encoding: 'utf8',
  }).trim();
}
export function validateSource(source: string, commit: string): string {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error('A full source commit SHA is required');
  if (
    realpathSync(git(source, 'rev-parse', '--show-toplevel')) !==
    realpathSync(source)
  )
    throw new Error('Source directory must be the repository root');
  const origin = git(source, 'remote', 'get-url', 'origin');
  if (
    ![
      SOURCE_REPOSITORY,
      `${SOURCE_REPOSITORY}.git`,
      'git@github.com:genfeedai/skills.git',
    ].includes(origin)
  )
    throw new Error('Wrong source repository');
  if (git(source, 'rev-parse', 'HEAD') !== commit)
    throw new Error('Wrong source revision');
  if (git(source, 'status', '--porcelain', '--untracked-files=all'))
    throw new Error('Source checkout must be clean');
  return new Date(
    git(source, 'show', '-s', '--format=%cI', commit),
  ).toISOString();
}
const MODULES_FILE = 'scripts/modules.json';

/**
 * The skills repository groups every skill into a module folder
 * (`<module>/<slug>/SKILL.md`). The module list lives in the source's own
 * `scripts/modules.json`, so a new module needs no change here.
 */
function sourceModules(source: string): string[] {
  const tracked = git(source, 'ls-files', '-z', '--', MODULES_FILE)
    .split('\0')
    .filter(Boolean);
  if (tracked.length !== 1)
    throw new Error(`Source is missing ${MODULES_FILE}`);
  const parsed = JSON.parse(
    readFileSync(join(source, MODULES_FILE), 'utf8'),
  ) as {
    modules?: Record<string, unknown>;
  };
  const modules = Object.keys(parsed.modules ?? {});
  if (modules.length === 0) throw new Error(`${MODULES_FILE} lists no modules`);
  for (const module of modules) assertSafePath(module);
  return modules;
}

/** `<module>/<slug>` of every skill the pinned source publishes, by slug. */
export function sourceSkillPaths(source: string): string[] {
  const modules = new Set(sourceModules(source));
  const bySlug = new Map<string, string>();
  for (const path of git(source, 'ls-files', '-z').split('\0')) {
    const match = /^([^/]+)\/([^/]+)\/SKILL\.md$/.exec(path);
    if (!match || !modules.has(match[1])) continue;
    const slug = match[2];
    const existing = bySlug.get(slug.toLowerCase());
    if (existing)
      throw new Error(
        `Duplicate source slug: ${slug} in ${existing} and ${match[1]}`,
      );
    bySlug.set(slug.toLowerCase(), `${match[1]}/${slug}`);
  }
  return [...bySlug.values()].sort((a, b) =>
    basename(a) < basename(b) ? -1 : basename(a) > basename(b) ? 1 : 0,
  );
}
function sourcePackages(source: string) {
  if (lstatSync(source).isSymbolicLink())
    throw new Error('Source symlink rejected');
  const paths = sourceSkillPaths(source);
  return UPSTREAM_SLUGS.map((slug) => {
    const path = paths.find((candidate) => basename(candidate) === slug);
    if (!path) throw new Error(`Missing source slug: ${slug}`);
    if (lstatSync(join(source, path.split('/')[0])).isSymbolicLink())
      throw new Error(`Source symlink rejected: ${path}`);
    const directory = join(source, path);
    const files = inventory(directory, true);
    const tracked = git(source, 'ls-files', '-z', '--', path)
      .split('\0')
      .filter(Boolean)
      .map((file) => file.slice(path.length + 1))
      .sort();
    if (
      JSON.stringify(tracked) !==
      JSON.stringify(files.map((file) => file.path).sort())
    )
      throw new Error(`Undeclared source files: ${slug}`);
    return {
      slug,
      path,
      directory,
      files,
      instructions: compileSkill(directory, files).instructions,
    };
  });
}
export function syncProductSkills(
  root: string,
  options: {
    sourceDir?: string;
    commit?: string;
    write?: boolean;
    checkSource?: boolean;
  },
): void {
  const directory = join(root, 'skills');
  if (lstatSync(directory).isSymbolicLink())
    throw new Error('Destination symlink rejected');
  if (!options.write) {
    const lock = validateCatalogLock(directory);
    const index = renderSkillsIndex(root, lock.sourceCommittedAt);
    const readme = renderSkillsReadme(root);
    if (
      readFileSync(join(directory, 'index.json'), 'utf8') !== index ||
      readFileSync(join(directory, 'README.md'), 'utf8') !== readme
    )
      throw new Error('Catalog index/README drift');
    if (options.checkSource) {
      if (!options.sourceDir) throw new Error('--source-dir is required');
      const timestamp = validateSource(options.sourceDir, lock.sourceCommit);
      if (timestamp !== lock.sourceCommittedAt)
        throw new Error('Source date mismatch');
      if (
        JSON.stringify(sourceSkillPaths(options.sourceDir)) !==
        JSON.stringify(lock.sourceSkillPaths)
      )
        throw new Error('Source skill inventory mismatch');
      for (const pkg of sourcePackages(options.sourceDir)) {
        const entry = lock.skills.find((skill) => skill.slug === pkg.slug);
        if (
          pkg.path !== entry?.sourcePath ||
          JSON.stringify(pkg.files) !== JSON.stringify(entry?.files)
        )
          throw new Error(`Source mismatch: ${pkg.slug}`);
      }
    }
    return;
  }
  if (!options.sourceDir || !options.commit)
    throw new Error('--source-dir and --commit are required for --write');
  const committedAt = validateSource(options.sourceDir, options.commit);
  const publishedPaths = sourceSkillPaths(options.sourceDir);
  const packages = sourcePackages(options.sourceDir);
  const initialImport = !existsSync(join(directory, 'catalog.lock.json'));
  const existing = catalogSkillDirectories(directory);
  // Validate every existing destination and every incoming package before the first write.
  for (const skill of existing) inventory(join(directory, skill.path));
  for (const pkg of packages) {
    const current = existing.find((skill) => skill.slug === pkg.slug);
    // A new pin may add skills; only the very first import needs every folder.
    if (initialImport && !current)
      throw new Error(`Missing destination: ${pkg.slug}`);
    if (
      initialImport &&
      current &&
      compileSkill(join(directory, current.path)).instructions !==
        pkg.instructions
    )
      throw new Error(`Instruction output would change: ${pkg.slug}`);
  }
  // A skill the source moved to another module leaves its old folder behind.
  const movedAway = (root: string) => {
    for (const pkg of packages) {
      const current = existing.find((skill) => skill.slug === pkg.slug);
      if (current && current.path !== pkg.path)
        rmSync(join(root, current.path), { recursive: true });
    }
  };
  const dropEmptyModules = (root: string) => {
    for (const name of readdirSync(root))
      if (
        lstatSync(join(root, name)).isDirectory() &&
        readdirSync(join(root, name)).length === 0
      )
        rmSync(join(root, name), { recursive: true });
  };
  const stagingRoot = mkdtempSync(join(tmpdir(), 'product-catalog-import-'));
  try {
    const stagedDirectory = join(stagingRoot, 'skills');
    cpSync(directory, stagedDirectory, { recursive: true });
    movedAway(stagedDirectory);
    for (const pkg of packages) {
      const target = join(stagedDirectory, pkg.path);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      for (const file of pkg.files) {
        const path = join(target, file.path);
        mkdirSync(resolve(path, '..'), { recursive: true });
        writeFileSync(path, readFileSync(join(pkg.directory, file.path)));
      }
    }
    const lock = createCatalogLock(
      stagedDirectory,
      options.commit,
      committedAt,
      publishedPaths,
    );
    const index = renderSkillsIndex(stagingRoot, committedAt);
    const readme = renderSkillsReadme(stagingRoot);
    // No actual destination is changed until all compiler/artifact inputs validate.
    movedAway(directory);
    for (const pkg of packages) {
      const target = join(directory, pkg.path);
      rmSync(target, { recursive: true, force: true });
      mkdirSync(resolve(target, '..'), { recursive: true });
      cpSync(join(stagedDirectory, pkg.path), target, { recursive: true });
    }
    dropEmptyModules(directory);
    writeFileSync(
      join(directory, 'catalog.lock.json'),
      `${JSON.stringify(lock, null, 2)}\n`,
    );
    writeFileSync(join(directory, 'index.json'), index);
    writeFileSync(join(directory, 'README.md'), readme);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  const value = (flag: string) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  if (
    !args.includes('--write') &&
    !args.includes('--check') &&
    !args.includes('--check-source')
  )
    throw new Error('Specify --write or --check');
  if (
    args.includes('--write') &&
    (args.includes('--check') || args.includes('--check-source'))
  )
    throw new Error('Write and check modes are mutually exclusive');
  syncProductSkills(process.cwd(), {
    sourceDir: value('--source-dir'),
    commit: value('--commit'),
    write: args.includes('--write'),
    checkSource: args.includes('--check-source'),
  });
  console.log('Product skill catalog verified.');
}
