import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  assertSafePath,
  createCatalogLock,
  inventory,
  isLocalToolingPath,
  UPSTREAM_SLUGS,
} from '@api/collections/skills/catalog/skill-catalog-artifact';
import type { RepoArchive } from '@api/collections/skills/sync/github-repo-archive';

const MODULES_FILE = 'scripts/modules.json';
const SKILL_FILE_PATTERN = /^([^/]+)\/([^/]+)\/SKILL\.md$/;
const APPLICATION_MODULE = 'app';

export interface StagedSkillCatalog {
  /** A catalog directory that `loadFirstPartySkillDefinitions` can read. */
  directory: string;
  dispose: () => void;
}

/** The module folders the source declares, as its own `scripts/modules.json` lists them. */
function sourceModules(archive: RepoArchive): Set<string> {
  const file = archive.files.get(MODULES_FILE);
  if (!file) throw new Error(`Source is missing ${MODULES_FILE}`);
  const parsed = JSON.parse(new TextDecoder().decode(file)) as {
    modules?: Record<string, unknown>;
  };
  const modules = Object.keys(parsed.modules ?? {});
  if (modules.length === 0) throw new Error(`${MODULES_FILE} lists no modules`);
  for (const module of modules) assertSafePath(module);
  return new Set(modules);
}

/** `<module>/<slug>` of every skill the source publishes, sorted by slug. */
function publishedSkillPaths(archive: RepoArchive): string[] {
  const modules = sourceModules(archive);
  const bySlug = new Map<string, string>();
  for (const path of archive.files.keys()) {
    const match = SKILL_FILE_PATTERN.exec(path);
    if (!match || !modules.has(match[1])) continue;
    const key = match[2].toLowerCase();
    const existing = bySlug.get(key);
    if (existing) {
      throw new Error(
        `Duplicate source slug: ${match[2]} in ${existing} and ${match[1]}`,
      );
    }
    bySlug.set(key, `${match[1]}/${match[2]}`);
  }
  return [...bySlug.values()].sort((a, b) => {
    const left = a.split('/')[1];
    const right = b.split('/')[1];
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * Lays an upstream skills commit out as a product catalog directory: the
 * pinned upstream skills from the archive, plus the application's own skills
 * from `applicationRoot`, with a fresh lock. Every check the pin script runs
 * (safe paths, supported files, reference limits, owned slugs) runs here too,
 * so a catalog that stages is one the app loads. Throws on the first problem.
 */
export function stageUpstreamSkillCatalog(
  archive: RepoArchive,
  applicationRoot: string,
): StagedSkillCatalog {
  const root = mkdtempSync(join(tmpdir(), 'skills-refresh-'));
  const dispose = () => rmSync(root, { force: true, recursive: true });
  try {
    const directory = join(root, 'skills');
    cpSync(
      join(applicationRoot, APPLICATION_MODULE),
      join(directory, APPLICATION_MODULE),
      { recursive: true },
    );
    const published = publishedSkillPaths(archive);
    for (const slug of UPSTREAM_SLUGS) {
      const path = published.find((candidate) =>
        candidate.endsWith(`/${slug}`),
      );
      if (!path) throw new Error(`Missing source slug: ${slug}`);
      const prefix = `${path}/`;
      for (const [file, contents] of archive.files) {
        if (!file.startsWith(prefix)) continue;
        const relative = file.slice(prefix.length);
        if (isLocalToolingPath(slug, relative)) continue;
        assertSafePath(relative);
        const target = join(directory, path, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, contents);
      }
      inventory(join(directory, path), true, (candidate) =>
        isLocalToolingPath(slug, candidate),
      );
    }
    const lock = createCatalogLock(
      directory,
      archive.commit,
      archive.committedAt,
      published,
    );
    writeFileSync(
      join(directory, 'catalog.lock.json'),
      `${JSON.stringify(lock, null, 2)}\n`,
    );
    return { directory, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
