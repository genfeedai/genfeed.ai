import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../packages/prisma/prisma/migrations/20261004100000_default_studio_elements/migration.sql',
  ),
  'utf8',
);

const TABLES = [
  'elements_styles',
  'elements_moods',
  'elements_scenes',
  'elements_cameras',
  'elements_lenses',
  'elements_lightings',
  'elements_camera_movements',
  'elements_sounds',
];

function seededKeys(table: string): string[] {
  const section =
    migration.split(`-- ${table}\n`)[1]?.split('\nWHERE')[0] ?? '';
  return [...section.matchAll(/^ {2}\('([a-z0-9-]+)', '/gm)].map(
    (match) => match[1] ?? '',
  );
}

describe('default Studio elements migration (#6038)', () => {
  it('makes organizationId nullable on every platform-capable table', () => {
    for (const table of TABLES) {
      expect(migration).toContain(`ALTER TABLE "${table}"`);
    }
    expect(migration.match(/DROP NOT NULL/g)).toHaveLength(TABLES.length);
    expect(migration).not.toContain('elements_blacklists');
  });

  it('seeds the required style catalog', () => {
    expect(seededKeys('elements_styles')).toEqual(
      expect.arrayContaining([
        'photoreal',
        'cinematic',
        '3d-animated',
        'anime',
        'comic',
        'pixel-art',
        'oil-painting',
        'watercolor',
        'cyberpunk',
        'fantasy',
        'sketch',
        'minimalist',
        'vintage',
      ]),
    );
  });

  it('seeds a non-empty, duplicate-free catalog for every type', () => {
    for (const table of TABLES) {
      const keys = seededKeys(table);
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('inserts only missing platform keys so re-runs never overwrite', () => {
    expect(migration.match(/WHERE NOT EXISTS/g)).toHaveLength(TABLES.length);
    expect(migration.match(/existing\."organizationId" IS NULL/g)).toHaveLength(
      TABLES.length,
    );
    expect(migration).not.toMatch(/ON CONFLICT[^;]*DO UPDATE/);
    expect(migration).not.toMatch(/UPDATE "elements_/);
  });
});

describe('default Studio elements seed-by-id migration (#6038 review)', () => {
  const rerun = readFileSync(
    path.resolve(
      __dirname,
      '../../../../../../packages/prisma/prisma/migrations/20261004110000_default_studio_elements_seed_by_id/migration.sql',
    ),
    'utf8',
  );

  it('decides existence by deterministic id or platform key in every section', () => {
    expect(
      rerun.match(/existing\."id" = 'c' \|\| substr\(md5\(/g),
    ).toHaveLength(TABLES.length);
    expect(
      rerun.match(/existing\."organizationId" IS NULL AND existing\."key"/g),
    ).toHaveLength(TABLES.length);
  });

  it('seeds the same catalog and never updates or alters', () => {
    for (const table of TABLES) {
      const keys = (
        rerun.split(`-- ${table}\n`)[1]?.split('\nWHERE')[0] ?? ''
      ).match(/^ {2}\('([a-z0-9-]+)', '/gm);
      expect(keys?.length).toBe(seededKeys(table).length);
    }
    expect(rerun).not.toMatch(/\bUPDATE\b|\bALTER\b|ON CONFLICT/);
  });
});
