import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isLocalDatabaseUrl,
  loadEnvSeeds,
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
      validateRuntime: false,
    });
    expect(parseHarnessSeedArgs(['--live']).dryRun).toBe(false);
  });

  it('uses the fixture seed only when no module or env seeds exist', () => {
    expect(loadSeeds(undefined, {}).map((seed) => seed.id)).toEqual([
      'fixture-genfeed-brand',
    ]);
  });

  it('reads plain and gzip HARNESS_SEED_* env values, ignoring others', () => {
    const gz = gzipSync(
      JSON.stringify({ brandName: 'Beta', id: 'beta-brand' }),
    ).toString('base64');

    expect(
      loadEnvSeeds({
        DATABASE_URL: 'postgres://db',
        HARNESS_SEED_ALPHA: JSON.stringify({ brandName: 'Alpha', id: 'alpha' }),
        HARNESS_SEED_BETA: `gz:${gz}`,
      }).map((seed) => seed.id),
    ).toEqual(['alpha', 'beta-brand']);
  });

  it('rejects a malformed env seed instead of skipping it', () => {
    expect(() =>
      loadEnvSeeds({ HARNESS_SEED_BAD: JSON.stringify({ id: 'x' }) }),
    ).toThrow('HARNESS_SEED_BAD is not a harness seed');
  });

  it('prefers env seeds over the fixture', () => {
    expect(
      loadSeeds(undefined, {
        HARNESS_SEED_ALPHA: JSON.stringify({ brandName: 'Alpha', id: 'alpha' }),
      }).map((seed) => seed.id),
    ).toEqual(['alpha']);
  });

  it('detects local database hosts', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@localhost:5432/genfeed')).toBe(
      true,
    );
    expect(
      isLocalDatabaseUrl('postgres://u:p@db.example.rds.amazonaws.com/genfeed'),
    ).toBe(false);
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
