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
import { join, resolve } from 'node:path';
import {
  catalogSlugs,
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
function sourcePackages(source: string) {
  if (lstatSync(source).isSymbolicLink())
    throw new Error('Source symlink rejected');
  const names = readdirSync(source);
  for (const slug of UPSTREAM_SLUGS) {
    if (names.filter((name) => name.toLowerCase() === slug).length !== 1)
      throw new Error(`Missing or duplicate source slug: ${slug}`);
  }
  return UPSTREAM_SLUGS.map((slug) => {
    const directory = join(source, slug);
    const files = inventory(directory, true);
    const tracked = git(source, 'ls-files', '-z', '--', slug)
      .split('\0')
      .filter(Boolean)
      .map((path) => path.slice(slug.length + 1))
      .sort();
    if (
      JSON.stringify(tracked) !==
      JSON.stringify(files.map((file) => file.path).sort())
    )
      throw new Error(`Undeclared source files: ${slug}`);
    return {
      slug,
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
      for (const pkg of sourcePackages(options.sourceDir)) {
        const entry = lock.skills.find((skill) => skill.slug === pkg.slug);
        if (JSON.stringify(pkg.files) !== JSON.stringify(entry?.files))
          throw new Error(`Source mismatch: ${pkg.slug}`);
      }
    }
    return;
  }
  if (!options.sourceDir || !options.commit)
    throw new Error('--source-dir and --commit are required for --write');
  const committedAt = validateSource(options.sourceDir, options.commit);
  const packages = sourcePackages(options.sourceDir);
  const initialImport = !existsSync(join(directory, 'catalog.lock.json'));
  const slugs = catalogSlugs(directory);
  // Validate every existing destination and every incoming package before the first write.
  for (const slug of slugs) inventory(join(directory, slug));
  for (const pkg of packages) {
    if (!slugs.includes(pkg.slug))
      throw new Error(`Missing destination: ${pkg.slug}`);
    if (
      initialImport &&
      compileSkill(join(directory, pkg.slug)).instructions !== pkg.instructions
    )
      throw new Error(`Instruction output would change: ${pkg.slug}`);
  }
  const stagingRoot = mkdtempSync(join(tmpdir(), 'product-catalog-import-'));
  try {
    const stagedDirectory = join(stagingRoot, 'skills');
    cpSync(directory, stagedDirectory, { recursive: true });
    for (const pkg of packages) {
      const target = join(stagedDirectory, pkg.slug);
      rmSync(target, { recursive: true });
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
    );
    const index = renderSkillsIndex(stagingRoot, committedAt);
    const readme = renderSkillsReadme(stagingRoot);
    // No actual destination is changed until all compiler/artifact inputs validate.
    for (const pkg of packages) {
      const target = join(directory, pkg.slug);
      rmSync(target, { recursive: true });
      cpSync(join(stagedDirectory, pkg.slug), target, { recursive: true });
    }
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
