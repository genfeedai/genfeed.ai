import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProductSkillsDirectory } from '@api/collections/skills/catalog/first-party-skill-loader';
import { UPSTREAM_SLUGS } from '@api/collections/skills/catalog/skill-catalog-artifact';
import type {
  SkillCatalogReconcileOptions,
  SkillCatalogSeedService,
} from '@api/seeds/skill-catalog-seed.service';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminSkillSyncService } from './skill-sync.service';

const productRoot = resolveProductSkillsDirectory() as string;
const COMMIT = 'c'.repeat(40);

/** A seed double that reports every skill as unchanged, like a database already in sync. */
const unchangedSeed = {
  reconcileCatalog: async (
    catalog: { slug: string }[],
    options: SkillCatalogReconcileOptions,
  ) => {
    for (const { slug } of catalog)
      options.onOutcome?.(slug, 'skipped', {
        after: 'name: x\n\nbody',
        before: 'name: x\n\nbody',
        change: 'unchanged',
      });
    return { inserted: 0, skipped: catalog.length, updated: 0 };
  },
} as unknown as SkillCatalogSeedService;

function pinnedZip(): Uint8Array {
  const lock = JSON.parse(
    readFileSync(join(productRoot, 'catalog.lock.json'), 'utf8'),
  ) as { sourceSkillPaths: string[] };
  const entries: Record<string, Uint8Array> = {};
  const modules: Record<string, true> = {};
  const walk = (path: string) => {
    for (const entry of readdirSync(join(productRoot, path), {
      withFileTypes: true,
    })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else
        entries[`skills-ccc/${child}`] = readFileSync(join(productRoot, child));
    }
  };
  for (const path of lock.sourceSkillPaths) {
    if (!UPSTREAM_SLUGS.includes(path.split('/')[1])) continue;
    modules[path.split('/')[0]] = true;
    walk(path);
  }
  entries['skills-ccc/scripts/modules.json'] = strToU8(
    JSON.stringify({ modules }),
  );
  return zipSync(entries);
}

function stubGitHub(zip: Uint8Array) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('https://api.github.com/')) {
        return Response.json({
          commit: { committer: { date: '2026-11-27T09:00:00Z' } },
          sha: COMMIT,
        });
      }
      const response = new Response(Uint8Array.from(zip));
      Object.defineProperty(response, 'url', { value: url });
      return response;
    }),
  );
}

describe('AdminSkillSyncService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to a dry run and reports the commit and every skill', async () => {
    stubGitHub(pinnedZip());

    const summary = await new AdminSkillSyncService(
      unchangedSeed,
    ).syncPlatformSkills({});

    expect(summary.dryRun).toBe(true);
    expect(summary.commit).toBe(COMMIT);
    expect(summary.committedAt).toBe('2026-11-27T09:00:00.000Z');
    expect(summary.repository).toBe('genfeedai/skills');
    expect(summary.items.map((item) => item.change)).toEqual(
      summary.items.map(() => 'unchanged'),
    );
    expect(summary.items.map((item) => item.key)).toContain('x-post');
    expect(summary.items.find((item) => item.key === 'x-post')?.path).toBe(
      'x-post/SKILL.md',
    );
    expect(summary.totals.unchanged).toBe(summary.items.length);
    expect(summary.totals.conflict).toBe(0);
  });

  it('answers 502 when GitHub cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );

    await expect(
      new AdminSkillSyncService(unchangedSeed).syncPlatformSkills({}),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('answers 422 when the repository is not a valid skills catalog', async () => {
    stubGitHub(zipSync({ 'skills-ccc/README.md': strToU8('empty') }));

    await expect(
      new AdminSkillSyncService(unchangedSeed).syncPlatformSkills({}),
    ).rejects.toMatchObject({ status: 422 });
  });
});
