import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const FOLDER = '20261011160000_agent_strategy_schedule_actor';
const migration = readFileSync(
  join(prismaDir, `migrations/${FOLDER}/migration.sql`),
  'utf8',
);
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const statements = migration.replace(/^\s*--.*$/gm, '');

describe('agent strategy schedule actor migration (#6689)', () => {
  it('applies after the workflow actor grandfather and every earlier migration', () => {
    const folders = readdirSync(join(prismaDir, 'migrations')).filter((name) =>
      /^\d{14}_/.test(name),
    );
    expect(folders).toContain(FOLDER);
    for (const earlier of [
      '20261009020000_workflow_schedule_initiating_actor',
      '20261011130000_workflow_schedule_actor_grandfather',
    ]) {
      expect(folders).toContain(earlier);
      expect(FOLDER > earlier).toBe(true);
    }
  });

  it('adds one nullable JSONB column and declares it on the model', () => {
    expect(statements).toMatch(
      /ALTER TABLE "agent_strategies" ADD COLUMN "scheduleInitiatingActor" JSONB;/,
    );
    expect(statements.match(/\bALTER\b/gi)).toHaveLength(1);
    expect(statements).not.toMatch(/\b(CREATE|DROP|TRUNCATE|DELETE\s+FROM)\b/i);
    expect(statements).not.toMatch(/\bEXECUTE\b/i);
    const model = schema.match(/model AgentStrategy \{[\s\S]*?\n\}/)?.[0];
    expect(model).toBeDefined();
    expect(model).toMatch(/scheduleInitiatingActor\s+Json\?/);
  });

  it('only updates strategies, and only their actor', () => {
    expect(statements.match(/\bUPDATE\b/gi)).toHaveLength(1);
    const setClause = statements.match(/\bSET\b([\s\S]*?)\bWHERE\b/i)?.[1];
    expect(setClause).toBeDefined();
    expect(setClause).toContain('"scheduleInitiatingActor"');
    expect(setClause).not.toContain('isDeleted');
    expect(setClause).not.toContain('isActive');
    expect(setClause).not.toContain('"config"');
  });

  it('binds only active, enabled, undeleted strategies that have no actor', () => {
    for (const condition of [
      's."isDeleted" = false',
      's."isActive" = true',
      `s."config" -> 'isEnabled' IS DISTINCT FROM 'false'::jsonb`,
      's."scheduleInitiatingActor" IS NULL',
      `jsonb_typeof(s."scheduleInitiatingActor") = 'null'`,
    ]) {
      expect(statements).toContain(condition);
    }
  });

  it('requires the owner to be a live member of the strategy organization', () => {
    for (const condition of [
      'm."userId" = s."userId"',
      'm."organizationId" = s."organizationId"',
      'm."isActive" = true',
      'm."isDeleted" = false',
      'o."isDeleted" = false',
      'r."isDeleted" = false',
    ]) {
      expect(statements).toContain(condition);
    }
  });

  it('writes the session-user actor shape and nothing else', () => {
    expect(statements).toContain(`'isApiKey', false`);
    expect(statements).toContain(`'organizationId', s."organizationId"`);
    expect(statements).toContain(`'scopes', '[]'::jsonb`);
    expect(statements).toContain(`'userId', s."userId"`);
    expect(statements).not.toContain('apiKeyId');
  });
});
