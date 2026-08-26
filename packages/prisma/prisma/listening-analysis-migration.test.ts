import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260826200000_add_listening_analysis/migration.sql',
  ),
  'utf8',
);

describe('attributable listening analysis persistence (#1796)', () => {
  it('keeps themes, explicit evidence joins, and signals scoped and idempotent', () => {
    expect(schema).toContain('model ListeningTheme {');
    expect(schema).toContain('model ListeningThemeEvidence {');
    expect(schema).toContain('model ListeningSignal {');
    expect(schema).toContain(
      '@@unique([organizationId, brandId, topicId, idempotencyKey]',
    );
    expect(schema).toContain(
      '@@id([themeId, evidenceId], map: "listening_theme_evidence_pkey")',
    );
    expect(migration).toContain('CREATE TABLE "listening_themes"');
    expect(migration).toContain('CREATE TABLE "listening_theme_evidence"');
    expect(migration).toContain('CREATE TABLE "listening_signals"');
    expect(migration).toContain('listening_signals_scope_idempotency_key');
    expect(migration).toContain('listening_themes_scope_analysis_idx');
    expect(migration).toContain('listening_signals_scope_analysis_idx');
  });

  it('enforces bounded windows, nullable values, confidence, and signal status', () => {
    expect(schema).toContain('currentWindowStart  DateTime');
    expect(schema).toContain('currentWindowEnd    DateTime');
    expect(schema).toContain('previousWindowStart DateTime');
    expect(schema).toContain('previousWindowEnd   DateTime');
    expect(schema).toContain('value               Float?');
    expect(schema).toContain('confidence          Float');
    expect(schema).toContain('includedSourceIds   String[]');
    expect(schema).toContain('excludedSourceIds   String[]');
    expect(migration).toContain('listening_themes_window_check');
    expect(migration).toContain('listening_signals_windows_check');
    expect(migration).toContain('listening_signals_value_status_check');
    expect(migration).toContain('listening_signals_confidence_check');
  });

  it('keeps the explicit evidence join inside one organization, brand, and topic', () => {
    expect(schema).toContain(
      '@relation(fields: [evidenceId, organizationId, brandId, topicId], references: [id, organizationId, brandId, topicId]',
    );
    expect(migration).toContain('listening_theme_evidence_theme_scope_fkey');
    expect(migration).toContain('listening_theme_evidence_evidence_scope_fkey');
    expect(migration).toContain(
      'FOREIGN KEY ("evidenceId", "organizationId", "brandId", "topicId")',
    );
  });
});
