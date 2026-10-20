import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261020210000_platform_flags_app_modules/migration.sql',
  ),
  'utf8',
);

describe('Platform flags app modules migration', () => {
  it.each([
    ['studio_storyboard', 'storyboard'],
    ['studio_turbo', 'turbo'],
    ['studio_motion', 'motion'],
    ['studio_clips', 'clips'],
    ['studio_editor', 'editor'],
  ])('carries the stored %s switch over to %s', (from, to) => {
    expect(migrationSource).toContain(`("flags" - '${from}')`);
    expect(migrationSource).toContain(
      `jsonb_build_object('${to}', "flags" -> '${from}')`,
    );
    expect(migrationSource).toContain(`"flags" ? '${from}'`);
  });

  it('only touches object flag maps and never rewrites other rows', () => {
    expect(
      migrationSource.match(/jsonb_typeof\("flags"\) = 'object'/g),
    ).toHaveLength(5);
    expect(migrationSource).not.toMatch(/\bDELETE\b|\bDROP\b/);
  });
});
