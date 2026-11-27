import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadFirstPartySkillDefinitions,
  resolveProductSkillsDirectory,
} from '@api/collections/skills/catalog/first-party-skill-loader';
import {
  type CatalogLock,
  UPSTREAM_SLUGS,
} from '@api/collections/skills/catalog/skill-catalog-artifact';
import { describe, expect, it } from 'vitest';

import type { RepoArchive } from './github-repo-archive';
import { stageUpstreamSkillCatalog } from './upstream-skill-stage';

const productRoot = resolveProductSkillsDirectory() as string;
const lock = JSON.parse(
  readFileSync(join(productRoot, 'catalog.lock.json'), 'utf8'),
) as CatalogLock;

function readTree(directory: string, prefix = ''): [string, Uint8Array][] {
  return readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory()
        ? readTree(directory, path)
        : [[path, readFileSync(join(directory, path))] as [string, Uint8Array]];
    },
  );
}

/** The pinned upstream skills, laid out as the public skills repository holds them. */
function pinnedArchive(): RepoArchive {
  const files = new Map<string, Uint8Array>();
  const modules: Record<string, true> = {};
  for (const path of lock.sourceSkillPaths) {
    const [module, slug] = path.split('/');
    if (!UPSTREAM_SLUGS.includes(slug)) continue;
    modules[module] = true;
    for (const [file, contents] of readTree(join(productRoot, path))) {
      files.set(`${path}/${file}`, contents);
    }
  }
  files.set(
    'scripts/modules.json',
    new TextEncoder().encode(JSON.stringify({ modules })),
  );
  return {
    commit: 'b'.repeat(40),
    committedAt: '2026-11-27T09:00:00.000Z',
    files,
  };
}

function stage(archive: RepoArchive) {
  const staged = stageUpstreamSkillCatalog(archive, productRoot);
  try {
    return loadFirstPartySkillDefinitions(staged.directory);
  } finally {
    staged.dispose();
  }
}

describe('stageUpstreamSkillCatalog', () => {
  it('stages the pinned commit to the catalog the app already ships', () => {
    const shipped = loadFirstPartySkillDefinitions(productRoot);

    const staged = stage(pinnedArchive());

    expect(
      staged.map(({ slug, instructions }) => ({ instructions, slug })),
    ).toEqual(
      shipped.map(({ slug, instructions }) => ({ instructions, slug })),
    );
  });

  it('carries the new commit and an edited skill into the definitions', () => {
    const archive = pinnedArchive();
    const path = 'x/x-post/SKILL.md';
    const original = new TextDecoder().decode(archive.files.get(path));
    archive.files.set(
      path,
      new TextEncoder().encode(`${original}\n\nAlways end with a question.`),
    );

    const staged = stage(archive);

    const edited = staged.find((skill) => skill.slug === 'x-post');
    expect(edited?.instructions).toContain('Always end with a question.');
    expect(edited?.sourceCommit).toBe('b'.repeat(40));
  });

  it('refuses an archive that is missing a pinned skill and cleans up', () => {
    const archive = pinnedArchive();
    for (const file of [...archive.files.keys()]) {
      if (file.includes('/x-thread/')) archive.files.delete(file);
    }

    expect(() => stageUpstreamSkillCatalog(archive, productRoot)).toThrow(
      'Missing source slug: x-thread',
    );
  });

  it('refuses a skill file with an unsupported type', () => {
    const archive = pinnedArchive();
    archive.files.set('x/x-post/run.sh', new TextEncoder().encode('echo hi'));

    expect(() => stageUpstreamSkillCatalog(archive, productRoot)).toThrow(
      'Unsupported upstream file',
    );
  });

  it('removes its staging directory on dispose', () => {
    const staged = stageUpstreamSkillCatalog(pinnedArchive(), productRoot);
    expect(existsSync(staged.directory)).toBe(true);

    staged.dispose();

    expect(existsSync(staged.directory)).toBe(false);
  });
});
