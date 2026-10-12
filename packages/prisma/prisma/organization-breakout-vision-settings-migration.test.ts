import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const FOLDER = '20261012210000_organization_breakout_vision_settings';
const migration = readFileSync(
  join(prismaDir, `migrations/${FOLDER}/migration.sql`),
  'utf8',
);
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const statements = migration.replace(/^\s*--.*$/gm, '');
const model = schema.match(/model OrganizationSetting \{[\s\S]*?\n\}/)?.[0];

const COLUMNS = [
  'isBreakoutResponsesEnabled',
  'isBreakoutAutoPublishEnabled',
  'isBrandVisionChecksEnabled',
] as const;

describe('organization breakout and vision settings migration (#6526, #6727)', () => {
  it('applies after the brand vision model settings and every earlier migration', () => {
    const folders = readdirSync(join(prismaDir, 'migrations')).filter((name) =>
      /^\d{14}_/.test(name),
    );
    expect(folders).toContain(FOLDER);
    for (const earlier of [
      '20261011200000_brand_visual_analysis_setting',
      '20261012120000_brand_vision_model_settings',
      '20261012180000_long_form_deliveries',
    ]) {
      expect(folders).toContain(earlier);
      expect(FOLDER > earlier).toBe(true);
    }
  });

  it('adds the three columns off by default, without touching existing rows', () => {
    for (const column of COLUMNS) {
      expect(statements).toContain(
        `ADD COLUMN "${column}" BOOLEAN NOT NULL DEFAULT false`,
      );
    }
    expect(statements.match(/\bALTER TABLE\b/gi)).toHaveLength(1);
    expect(statements).toMatch(/ALTER TABLE "organization_settings"/);
    expect(statements).not.toMatch(
      /\b(CREATE|DROP|TRUNCATE|DELETE\s+FROM|UPDATE)\b/i,
    );
  });

  it('declares each column on the model with a false default', () => {
    expect(model).toBeDefined();
    for (const column of COLUMNS) {
      expect(model).toMatch(
        new RegExp(`${column}\\s+Boolean\\s+@default\\(false\\)`),
      );
    }
  });
});
