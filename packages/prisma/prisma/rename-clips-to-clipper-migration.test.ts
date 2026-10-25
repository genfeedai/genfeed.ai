import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20261025210000_rename_clips_to_clipper/migration.sql',
  ),
  'utf8',
);

describe('Rename clips to clipper migration', () => {
  it.each([
    ['clips', 'clipper'],
    ['release_clips', 'release_clipper'],
  ])(
    'copies the stored %s platform flag to %s without enabling it',
    (from, to) => {
      expect(migrationSource).toContain(
        `jsonb_build_object('${to}', "flags" -> '${from}')`,
      );
      expect(migrationSource).toContain(`AND NOT ("flags" ? '${to}')`);
    },
  );

  it('keeps the old flag keys so a previous release still reads its own value', () => {
    expect(migrationSource).not.toContain(`("flags" - 'clips')`);
    expect(migrationSource).not.toContain(`("flags" - 'release_clips')`);
  });

  it('renames the app id inside every stored app-id list', () => {
    for (const column of [
      'releasedItemIds',
      'defaultRailOrder',
      'pinnedAppIds',
      'railAppOrder',
      'hiddenAppIds',
      'installedAppIds',
    ]) {
      expect(migrationSource).toContain(
        `array_replace("${column}", 'clips', 'clipper')`,
      );
    }
    expect(migrationSource).toContain(
      `"homeAppId" = 'clipper' WHERE "homeAppId" = 'clips'`,
    );
  });

  it('leaves the clip_projects and clip_results tables in place', () => {
    expect(migrationSource).not.toMatch(
      /\bDROP\b|\bRENAME\b|\bDELETE\b|\bALTER\b/,
    );
    expect(migrationSource).not.toMatch(/UPDATE "clip_(projects|results)"/);
  });

  it('only maps each MCP tool name to its clipper replacement', () => {
    expect(migrationSource).toContain(
      `WHEN 'generate_clips' THEN 'run_clipper'`,
    );
    expect(migrationSource).toContain(
      `WHEN 'list_clip_projects' THEN 'list_clipper_projects'`,
    );
  });
});
