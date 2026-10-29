import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkSkillTrustedBuiltinAllowlist,
  parseAllowlistSlugs,
  readLatestAllowlist,
} from './check-skill-trusted-builtin-allowlist';

const roots: string[] = [];

function allowlistSql(slugs: string[]): string {
  const list = slugs.map((slug) => `'${slug}'`).join(', ');
  return `CREATE OR REPLACE FUNCTION skill_is_trusted_builtin(skill_id TEXT, config JSONB)
RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT (config->>'slug') IN (${list});
$$;`;
}

function createRoot(options: {
  indexSlugs: string[];
  migrations: Record<string, string>;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'skill-allowlist-'));
  roots.push(root);
  mkdirSync(path.join(root, 'skills'), { recursive: true });
  writeFileSync(
    path.join(root, 'skills/index.json'),
    JSON.stringify({ skills: options.indexSlugs.map((slug) => ({ slug })) }),
  );
  for (const [name, sql] of Object.entries(options.migrations)) {
    const dir = path.join(root, 'packages/prisma/prisma/migrations', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'migration.sql'), sql);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('skill trusted-builtin allowlist guard', () => {
  it('keeps every skills/index.json slug in the newest allowlist', () => {
    expect(checkSkillTrustedBuiltinAllowlist()).toEqual([]);
  });

  it('reads the slug list from a definition', () => {
    expect(parseAllowlistSlugs(allowlistSql(['a', 'b']))).toEqual(['a', 'b']);
  });

  it('names the slug the allowlist is missing', () => {
    const root = createRoot({
      indexSlugs: ['a', 'clip-editor'],
      migrations: { '20261001000000_trust': allowlistSql(['a']) },
    });

    expect(checkSkillTrustedBuiltinAllowlist(root)).toEqual([
      { migration: '20261001000000_trust', slug: 'clip-editor' },
    ]);
  });

  it('judges the newest definition, not the first one', () => {
    const root = createRoot({
      indexSlugs: ['a', 'clip-editor'],
      migrations: {
        '20261001000000_trust': allowlistSql(['a']),
        '20261002000000_trust_clip_editor': allowlistSql(['a', 'clip-editor']),
        '20261003000000_unrelated': 'SELECT 1;',
      },
    });

    expect(readLatestAllowlist(root).migration).toBe(
      '20261002000000_trust_clip_editor',
    );
    expect(checkSkillTrustedBuiltinAllowlist(root)).toEqual([]);
  });

  it('allows slugs the index does not list', () => {
    const root = createRoot({
      indexSlugs: ['a'],
      migrations: { '20261001000000_trust': allowlistSql(['a', 'legacy']) },
    });

    expect(checkSkillTrustedBuiltinAllowlist(root)).toEqual([]);
  });
});
