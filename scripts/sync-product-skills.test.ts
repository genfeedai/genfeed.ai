import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSafePath,
  compileSkill,
  inventory,
  UPSTREAM_SLUGS,
  validateCatalogLock,
} from '../apps/server/api/src/collections/skills/catalog/skill-catalog-artifact';
import { syncProductSkills } from './sync-product-skills';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'catalog-fixture-'));
  roots.push(root);
  const source = join(root, 'source');
  const app = join(root, 'app');
  mkdirSync(source);
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
  git('init');
  git('config', 'user.name', 'Catalog Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('remote', 'add', 'origin', 'https://github.com/genfeedai/skills');
  for (const slug of UPSTREAM_SLUGS) {
    mkdirSync(join(source, slug, 'references'), { recursive: true });
    writeFileSync(
      join(source, slug, 'SKILL.md'),
      `---\nname: ${slug}\ndescription: Fixture\n---\n# Instructions`,
    );
    writeFileSync(join(source, slug, 'references', 'small.md'), 'Reference');
  }
  mkdirSync(join(app, 'skills'), { recursive: true });
  for (const slug of UPSTREAM_SLUGS)
    cpSync(join(source, slug), join(app, 'skills', slug), { recursive: true });
  writeFileSync(
    join(app, 'skills', 'README.md'),
    '# Skills\n\n## Skills\n\nold\n\n## Adding a skill\n',
  );
  const commit = () => {
    git('add', '.');
    git('commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const sha = commit();
  const write = () =>
    syncProductSkills(app, { sourceDir: source, commit: sha, write: true });
  return { root, source, app, sha, git, commit, write };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe('pinned catalog import', () => {
  it('is deterministic, offline and source-verifiable', () => {
    const f = fixture();
    f.write();
    const before = inventory(join(f.app, 'skills'));
    f.write();
    expect(inventory(join(f.app, 'skills'))).toEqual(before);
    syncProductSkills(f.app, {});
    syncProductSkills(f.app, { sourceDir: f.source, checkSource: true });
    expect(inventory(join(f.app, 'skills'))).toEqual(before);
  });
  it.each(['changed', 'deleted', 'added', 'compiler', 'index', 'readme'])(
    'rejects %s drift without writing',
    (mode) => {
      const f = fixture();
      f.write();
      const dir = join(f.app, 'skills');
      const skill = join(dir, UPSTREAM_SLUGS[0], 'SKILL.md');
      if (mode === 'changed') writeFileSync(skill, 'tampered');
      if (mode === 'deleted') rmSync(skill);
      if (mode === 'added')
        writeFileSync(join(dir, UPSTREAM_SLUGS[0], 'new.md'), 'new');
      if (mode === 'compiler') {
        const path = join(dir, 'catalog.lock.json');
        writeFileSync(
          path,
          readFileSync(path, 'utf8').replace('legacy-v1-char-caps', 'other'),
        );
      }
      if (mode === 'index') writeFileSync(join(dir, 'index.json'), '{}');
      if (mode === 'readme') writeFileSync(join(dir, 'README.md'), '# wrong');
      const before = inventory(dir);
      expect(() => syncProductSkills(f.app, {})).toThrow();
      expect(inventory(dir)).toEqual(before);
    },
  );
  it('rejects dirty and wrong-pin sources before mutation', () => {
    const f = fixture();
    expect(() =>
      syncProductSkills(f.app, {
        sourceDir: f.source,
        commit: '0'.repeat(40),
        write: true,
      }),
    ).toThrow('revision');
    writeFileSync(join(f.source, UPSTREAM_SLUGS[0], 'extra.md'), 'dirty');
    expect(f.write).toThrow('clean');
  });
  it('allows a deliberate new-pin instruction update after the initial locked import', () => {
    const f = fixture();
    f.write();
    writeFileSync(
      join(f.source, UPSTREAM_SLUGS[0], 'SKILL.md'),
      `---\nname: ${UPSTREAM_SLUGS[0]}\ndescription: Updated\n---\n# Updated instructions`,
    );
    const sha = f.commit();
    syncProductSkills(f.app, { sourceDir: f.source, commit: sha, write: true });
    const lock = validateCatalogLock(join(f.app, 'skills'));
    expect(lock.sourceCommit).toBe(sha);
    expect(
      compileSkill(join(f.app, 'skills', UPSTREAM_SLUGS[0])).instructions,
    ).toContain('# Updated instructions');
    syncProductSkills(f.app, { sourceDir: f.source, checkSource: true });
  });

  it('rejects wrong origin and instruction changes', () => {
    const f = fixture();
    f.git('remote', 'set-url', 'origin', 'https://example.invalid/source');
    expect(f.write).toThrow('repository');
    f.git('remote', 'set-url', 'origin', 'https://github.com/genfeedai/skills');
    writeFileSync(join(f.source, UPSTREAM_SLUGS[0], 'SKILL.md'), 'different');
    const sha = f.commit();
    const before = inventory(join(f.app, 'skills'));
    expect(() =>
      syncProductSkills(f.app, {
        sourceDir: f.source,
        commit: sha,
        write: true,
      }),
    ).toThrow('Instruction');
    expect(inventory(join(f.app, 'skills'))).toEqual(before);
  });
  it.each(['symlink', 'executable', 'dotfile', 'invalid-json', 'invalid-utf8'])(
    'rejects %s packages before writes',
    (mode) => {
      const f = fixture();
      const path = join(
        f.source,
        UPSTREAM_SLUGS[0],
        mode === 'invalid-json'
          ? 'invalid.json'
          : mode === 'invalid-utf8'
            ? 'invalid.md'
            : mode === 'dotfile'
              ? '.hidden'
              : mode === 'executable'
                ? 'code.sh'
                : 'link.md',
      );
      if (mode === 'symlink') symlinkSync('/etc/passwd', path);
      else
        writeFileSync(
          path,
          mode === 'invalid-utf8' ? Buffer.from([0xff]) : 'do not execute',
        );
      const sha = f.commit();
      const before = inventory(join(f.app, 'skills'));
      expect(() =>
        syncProductSkills(f.app, {
          sourceDir: f.source,
          commit: sha,
          write: true,
        }),
      ).toThrow();
      expect(inventory(join(f.app, 'skills'))).toEqual(before);
    },
  );
  it.each(['null-metadata', 'missing-frontmatter', 'missing-description'])(
    'preflights %s before destination writes',
    (mode) => {
      const f = fixture();
      f.write();
      const directory = join(f.source, UPSTREAM_SLUGS[0]);
      if (mode === 'null-metadata')
        writeFileSync(join(directory, 'metadata.json'), 'null');
      else
        writeFileSync(
          join(directory, 'SKILL.md'),
          mode === 'missing-frontmatter'
            ? '# no frontmatter'
            : `---\nname: ${UPSTREAM_SLUGS[0]}\n---\n# missing description`,
        );
      const sha = f.commit();
      const before = inventory(join(f.app, 'skills'));
      expect(() =>
        syncProductSkills(f.app, {
          sourceDir: f.source,
          commit: sha,
          write: true,
        }),
      ).toThrow();
      expect(inventory(join(f.app, 'skills'))).toEqual(before);
    },
  );

  it('rejects destination symlinks and traversal', () => {
    const f = fixture();
    symlinkSync(f.source, join(f.app, 'skills', 'redirect'));
    expect(f.write).toThrow('symlink');
    for (const path of [
      '../escape',
      '/absolute',
      'x/../../escape',
      'x\\escape',
    ])
      expect(() => assertSafePath(path)).toThrow();
  });
  it('records character caps and nested exclusions while preserving legacy assembly', () => {
    const f = fixture();
    const dir = join(f.app, 'skills', UPSTREAM_SLUGS[0]);
    mkdirSync(join(dir, 'references', 'nested'));
    writeFileSync(join(dir, 'references', 'nested', 'other.md'), 'nested');
    writeFileSync(join(dir, 'references', 'large.md'), 'a'.repeat(8001));
    writeFileSync(join(dir, 'references', 'a.md'), 'é'.repeat(8000));
    writeFileSync(join(dir, 'references', 'b.md'), 'b'.repeat(8000));
    const compiled = compileSkill(dir);
    expect(compiled.instructions).toContain('Referenced: a.md');
    expect(compiled.instructions).not.toContain('Referenced: small.md');
    expect(compiled.excludedReferences).toEqual(
      expect.arrayContaining([
        { path: 'references/nested/other.md', reason: 'nested reference path' },
        {
          path: 'references/large.md',
          reason: 'per-file character cap (8000)',
        },
        { path: 'references/small.md', reason: 'total character cap (16000)' },
      ]),
    );
  });
  it('rejects a missing lock', () => {
    const f = fixture();
    expect(() => validateCatalogLock(join(f.app, 'skills'))).toThrow();
  });
  it('rejects hand-authored free skills that are neither pinned nor app procedures', () => {
    const f = fixture();
    f.write();
    const unowned = join(f.app, 'skills', 'unowned-content-skill');
    mkdirSync(unowned);
    writeFileSync(
      join(unowned, 'SKILL.md'),
      '---\nname: unowned-content-skill\ndescription: Fixture\n---\n# Copy',
    );
    const before = inventory(join(f.app, 'skills'));
    expect(f.write).toThrow('Unowned catalog skill: unowned-content-skill');
    expect(() => syncProductSkills(f.app, {})).toThrow(
      'Unowned catalog skill: unowned-content-skill',
    );
    expect(inventory(join(f.app, 'skills'))).toEqual(before);
  });
  it('rejects an application procedure that is also published upstream before mutation', () => {
    const f = fixture();
    f.write();
    mkdirSync(join(f.source, 'workflow-creator'));
    writeFileSync(
      join(f.source, 'workflow-creator', 'SKILL.md'),
      '---\nname: workflow-creator\ndescription: Copy\n---\n# Copy',
    );
    const sha = f.commit();
    const before = inventory(join(f.app, 'skills'));
    expect(() =>
      syncProductSkills(f.app, {
        sourceDir: f.source,
        commit: sha,
        write: true,
      }),
    ).toThrow('Application procedures also published');
    expect(inventory(join(f.app, 'skills'))).toEqual(before);
  });
  it('rejects a lock whose recorded source inventory lists an application procedure', () => {
    const f = fixture();
    f.write();
    const path = join(f.app, 'skills', 'catalog.lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    lock.sourceSkillSlugs = [...lock.sourceSkillSlugs, 'model-selector'].sort();
    writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
    expect(() => syncProductSkills(f.app, {})).toThrow(
      'Application procedures also published',
    );
  });
  it('rejects a recorded source inventory that differs from the pinned source', () => {
    const f = fixture();
    mkdirSync(join(f.source, 'public-only-skill'));
    writeFileSync(
      join(f.source, 'public-only-skill', 'SKILL.md'),
      '---\nname: public-only-skill\ndescription: Public\n---\n# Public',
    );
    const sha = f.commit();
    syncProductSkills(f.app, { sourceDir: f.source, commit: sha, write: true });
    const path = join(f.app, 'skills', 'catalog.lock.json');
    const lock = JSON.parse(readFileSync(path, 'utf8'));
    expect(lock.sourceSkillSlugs).toContain('public-only-skill');
    lock.sourceSkillSlugs = lock.sourceSkillSlugs.filter(
      (slug: string) => slug !== 'public-only-skill',
    );
    writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
    syncProductSkills(f.app, {});
    expect(() =>
      syncProductSkills(f.app, { sourceDir: f.source, checkSource: true }),
    ).toThrow('Source skill inventory mismatch');
  });
});
