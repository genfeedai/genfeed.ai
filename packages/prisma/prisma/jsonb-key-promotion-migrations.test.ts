import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function statement(migration: string): string {
  return readFileSync(
    new URL(`./migrations/${migration}/migration.sql`, import.meta.url),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

const schema = readFileSync(
  new URL('./schema.prisma', import.meta.url),
  'utf8',
);

function model(name: string, table: string): string {
  return schema.slice(
    schema.indexOf(`model ${name} {`),
    schema.indexOf(`@@map("${table}")`),
  );
}

it.each([
  [
    'AgentStrategyOpportunity',
    'agent_strategy_opportunities',
    /status\s+String\?/,
  ],
  [
    'AgentStrategyOpportunity',
    'agent_strategy_opportunities',
    /sourceType\s+String\?/,
  ],
  [
    'AgentStrategyOpportunity',
    'agent_strategy_opportunities',
    /topic\s+String\?/,
  ],
  [
    'AgentStrategyOpportunity',
    'agent_strategy_opportunities',
    /sourceRef\s+String\?/,
  ],
  [
    'AgentStrategyOpportunity',
    'agent_strategy_opportunities',
    /priorityScore\s+Float\?/,
  ],
  ['BotActivity', 'bot_activities', /status\s+String\?/],
  ['BotActivity', 'bot_activities', /botType\s+String\?/],
  ['BotActivity', 'bot_activities', /triggerTweetId\s+String\?/],
  ['BotActivity', 'bot_activities', /replyTweetId\s+String\?/],
  ['BotActivity', 'bot_activities', /dmSent\s+Boolean @default\(false\)/],
  [
    'BotActivity',
    'bot_activities',
    /isManuallyPosted\s+Boolean @default\(false\)/,
  ],
  [
    'BotActivity',
    'bot_activities',
    /isIntentNeedsReview\s+Boolean @default\(false\)/,
  ],
])('%s declares the promoted column %s %s', (name, table, column) => {
  expect(model(name, table)).toMatch(column);
});

describe('JSONB key promotion helpers', () => {
  it('copies a value only when its JSON type matches the old path filter', () => {
    const sql = statement('20261106200000_jsonb_promotion_helpers');
    expect(sql).toContain(
      `SELECT CASE WHEN jsonb_typeof(doc #> path) = 'string' THEN doc #>> path END`,
    );
    expect(sql).toContain(
      `WHEN jsonb_typeof(doc #> path) = 'number' THEN (doc #>> path)::double precision`,
    );
    expect(sql).toContain(
      `SELECT COALESCE(doc #> path = 'true'::jsonb, false)`,
    );
  });
});

describe.each([
  {
    backfill: '20261106200150_backfill_agent_strategy_opportunity_data_columns',
    backfillId: 'agent_strategy_opportunity_data_columns_20261106',
    migration: '20261106200100_agent_strategy_opportunity_data_columns',
    name: 'AgentStrategyOpportunity',
    trigger:
      'CREATE TRIGGER "agent_strategy_opportunity_data_promotion" BEFORE INSERT OR UPDATE OF "data" ON "agent_strategy_opportunities" FOR EACH ROW EXECUTE FUNCTION "promote_agent_strategy_opportunity_data"();',
  },
  {
    backfill: '20261106201050_backfill_bot_activity_data_columns',
    backfillId: 'bot_activity_data_columns_20261106',
    migration: '20261106201000_bot_activity_data_columns',
    name: 'BotActivity',
    trigger:
      'CREATE TRIGGER "bot_activity_data_promotion" BEFORE INSERT OR UPDATE OF "data" ON "bot_activities" FOR EACH ROW EXECUTE FUNCTION "promote_bot_activity_data"();',
  },
])('$name columns', (spec) => {
  it('recomputes the columns whenever the JSON is written', () => {
    expect(statement(spec.migration)).toContain(spec.trigger);
  });

  it('backfills existing rows in committed batches, as the only statement', () => {
    const sql = statement(spec.backfill);
    expect(sql.startsWith('DO $$')).toBe(true);
    expect(sql.endsWith('$$;')).toBe(true);
    expect(sql.match(/\$\$/g)).toHaveLength(2);
    expect(sql).toContain('AND "id" <= upper_bound');
    expect(sql).toContain('LIMIT 2000');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain(`'${spec.backfillId}'`);
  });
});

it.each([
  [
    '20261106200200_agent_strategy_opportunity_queue_index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_strategy_opportunities_queue_idx" ON "agent_strategy_opportunities" ("organizationId", "strategyId", "status") WHERE "isDeleted" = false;',
  ],
  [
    '20261106200300_agent_strategy_opportunity_dedupe_index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_strategy_opportunities_dedupe_idx" ON "agent_strategy_opportunities" ("organizationId", "strategyId", "sourceType") WHERE "isDeleted" = false;',
  ],
  [
    '20261106201100_bot_activity_status_index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "bot_activities_status_idx" ON "bot_activities" ("organizationId", "status", "createdAt" DESC) WHERE "isDeleted" = false;',
  ],
  [
    '20261106201200_bot_activity_intent_hold_index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "bot_activities_intent_hold_idx" ON "bot_activities" ("organizationId", "triggerTweetId", "createdAt" DESC) WHERE "isIntentNeedsReview" = true AND "isDeleted" = false;',
  ],
])('%s is a single concurrent index statement', (migration, expected) => {
  expect(statement(migration)).toBe(expected);
});
