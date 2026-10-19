import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../packages/prisma/prisma/migrations/20261019090000_default_system_blacklists/migration.sql',
  ),
  'utf8',
);

const seededRows = [
  ...migration.matchAll(
    /^ {2}\('([a-z0-9-]+)', '[^']+', '[^']+', '(image|video)', \d+\)/gm,
  ),
].map((match) => ({ category: match[2], key: match[1] }));

describe('default system blacklists migration', () => {
  it('makes blacklists platform-capable like the other elements', () => {
    expect(migration).toContain('ALTER TABLE "elements_blacklists"');
    expect(migration).toContain('DROP NOT NULL');
    expect(migration).toContain('"isActive" BOOLEAN NOT NULL DEFAULT true');
    expect(migration).toContain('"isDefault" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"sortOrder" INTEGER NOT NULL DEFAULT 0');
  });

  it('seeds duplicate-free image and video blacklists', () => {
    const keys = seededRows.map((row) => row.key);

    expect(keys).toEqual(expect.arrayContaining(['text', 'watermark']));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(seededRows.map((row) => row.category))).toEqual(
      new Set(['image', 'video']),
    );
  });

  it('leaves every seeded blacklist for the user to select', () => {
    expect(migration).toContain('false, true, false, seed."sortOrder"');
  });

  it('inserts only missing rows so re-runs never overwrite', () => {
    expect(migration.match(/WHERE NOT EXISTS/g)).toHaveLength(1);
    expect(migration).toContain(
      "existing.\"id\" = 'c' || substr(md5('elements_blacklists:'",
    );
    expect(migration).toContain(
      'existing."organizationId" IS NULL AND existing."key" = seed."key"',
    );
    expect(migration).not.toMatch(/ON CONFLICT[^;]*DO UPDATE/);
    expect(migration).not.toMatch(/UPDATE "elements_/);
  });
});
