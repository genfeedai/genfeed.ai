import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadSeeds,
  parseHarnessSeedArgs,
} from './harness-profiles-from-packs.seed';

const tempDirs: string[] = [];

function writeSeedModule(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-seed-'));
  tempDirs.push(dir);
  const path = join(dir, 'seeds.cjs');
  writeFileSync(path, body);
  return path;
}

describe('harness profile seed', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('defaults to a dry run and reads owner, org, env and packs', () => {
    expect(
      parseHarnessSeedArgs([
        '--env=production',
        '--ownerEmail=owner@example.com',
        '--organizationId=org_1',
        '--packs=@acme/private-harness',
      ]),
    ).toEqual({
      dryRun: true,
      env: 'production',
      organizationId: 'org_1',
      ownerEmail: 'owner@example.com',
      packs: '@acme/private-harness',
    });
    expect(parseHarnessSeedArgs(['--live']).dryRun).toBe(false);
  });

  it('uses the fixture seed only when no pack module is named', () => {
    expect(loadSeeds().map((seed) => seed.id)).toEqual([
      'fixture-genfeed-brand',
    ]);
  });

  it('loads valid PRIVATE_HARNESS_SEEDS and drops malformed entries', () => {
    const path = writeSeedModule(
      `module.exports = { PRIVATE_HARNESS_SEEDS: [
        { id: 'acme-brand', brandName: 'Acme', brandSlugs: ['acme'] },
        { id: 'missing-name' },
      ] };`,
    );

    expect(loadSeeds(path)).toEqual([
      { brandName: 'Acme', brandSlugs: ['acme'], id: 'acme-brand' },
    ]);
  });

  it('refuses a pack module without seeds instead of falling back', () => {
    const path = writeSeedModule('module.exports = { default: {} };');

    expect(() => loadSeeds(path)).toThrow('exports no PRIVATE_HARNESS_SEEDS');
  });
});
