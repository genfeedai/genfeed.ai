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
  [
    'WorkflowExecution',
    'workflow_executions',
    /contentRotationTargetKey\s+String\?/,
  ],
  ['ContentRun', 'content_runs', /contract\s+String\?/],
  ['ContentRun', 'content_runs', /clientRequestId\s+String\?/],
  ['ContentRun', 'content_runs', /createdByUserId\s+String\?/],
  ['ContentRun', 'content_runs', /skillSlug\s+String\?/],
  ['ContentRun', 'content_runs', /phase\s+String\?/],
  ['ContentRun', 'content_runs', /revision\s+Float\?/],
  [
    'TrendingVideo',
    'trending_videos',
    /isCurrent\s+Boolean\s+@default\(false\)/,
  ],
  ['TrendingVideo', 'trending_videos', /lookupKey\s+String\?/],
  ['TrendingHashtag', 'trending_hashtags', /expiresAt\s+DateTime\?/],
  ['TrendingHashtag', 'trending_hashtags', /lookupKey\s+String\?/],
  ['TrendingSound', 'trending_sounds', /platform\s+String\?/],
  ['TrendingSound', 'trending_sounds', /lookupKey\s+String\?/],
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

  it('turns an unparsable timestamp into NULL instead of failing the write', () => {
    const sql = statement('20261106203900_jsonb_timestamp_helper');
    expect(sql).toContain(`RETURN (value::timestamptz AT TIME ZONE 'UTC');`);
    expect(sql).toContain(
      'WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;',
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
  {
    backfill: '20261106203050_backfill_content_run_config_columns',
    backfillId: 'content_run_config_columns_20261106',
    migration: '20261106203000_content_run_config_columns',
    name: 'ContentRun',
    trigger:
      'CREATE TRIGGER "content_run_config_promotion" BEFORE INSERT OR UPDATE OF "config" ON "content_runs" FOR EACH ROW EXECUTE FUNCTION "promote_content_run_config"();',
  },
  {
    backfill: '20261106205050_backfill_trending_video_data_columns',
    backfillId: 'trending_video_data_columns_20261106',
    migration: '20261106205000_trending_video_data_columns',
    name: 'TrendingVideo',
    trigger:
      'CREATE TRIGGER "trending_video_data_promotion" BEFORE INSERT OR UPDATE OF "data" ON "trending_videos" FOR EACH ROW EXECUTE FUNCTION "promote_trending_video_data"();',
  },
  {
    backfill: '20261106206050_backfill_trending_hashtag_data_columns',
    backfillId: 'trending_hashtag_data_columns_20261106',
    migration: '20261106206000_trending_hashtag_data_columns',
    name: 'TrendingHashtag',
    trigger:
      'CREATE TRIGGER "trending_hashtag_data_promotion" BEFORE INSERT OR UPDATE OF "data" ON "trending_hashtags" FOR EACH ROW EXECUTE FUNCTION "promote_trending_hashtag_data"();',
  },
  {
    backfill: '20261106207050_backfill_trending_sound_data_columns',
    backfillId: 'trending_sound_data_columns_20261106',
    migration: '20261106207000_trending_sound_data_columns',
    name: 'TrendingSound',
    trigger:
      'CREATE TRIGGER "trending_sound_data_promotion" BEFORE INSERT OR UPDATE OF "data" ON "trending_sounds" FOR EACH ROW EXECUTE FUNCTION "promote_trending_sound_data"();',
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
    '20261106202050_backfill_workflow_execution_rotation_target_column',
    'workflow_execution_rotation_target_20261106',
  ],
  [
    '20261106204000_backfill_trend_columns_from_data',
    'trend_columns_from_data_20261106',
  ],
])(
  '%s backfills in committed batches, as the only statement',
  (migration, id) => {
    const sql = statement(migration);
    expect(sql.startsWith('DO $$')).toBe(true);
    expect(sql.endsWith('$$;')).toBe(true);
    expect(sql.match(/\$\$/g)).toHaveLength(2);
    expect(sql).toContain('LIMIT 2000');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain(`'${id}'`);
  },
);

it('copies the rotation target key on insert of a workflow execution', () => {
  expect(
    statement('20261106202000_workflow_execution_rotation_target_column'),
  ).toContain(
    `NEW."contentRotationTargetKey" := "workflow_execution_metadata_text"(metadata, 'contentRotationTargetKey');`,
  );
});

it('never overwrites a trend column the writer already set', () => {
  const sql = statement('20261106204000_backfill_trend_columns_from_data');
  expect(sql).toContain(
    `"platform" = COALESCE(t."platform", "jsonb_text_at"(t."data", '{platform}'))`,
  );
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
  [
    '20261106203100_content_run_contract_index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_runs_contract_idx" ON "content_runs" ("organizationId", "brandId", "contract", "updatedAt" DESC) WHERE "isDeleted" = false AND "contract" IS NOT NULL;',
  ],
  [
    '20261106203200_content_run_client_request_index',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_runs_client_request_idx" ON "content_runs" ("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;',
  ],
  [
    '20261106205100_trending_videos_current_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_videos_current_idx" ON "trending_videos" ("createdAt" DESC) WHERE "isCurrent" = true AND "isDeleted" = false;',
  ],
  [
    '20261106205200_trending_videos_lookup_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_videos_lookup_idx" ON "trending_videos" ("platform", "lookupKey") WHERE "isDeleted" = false;',
  ],
  [
    '20261106206100_trending_hashtags_current_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_hashtags_current_idx" ON "trending_hashtags" ("createdAt" DESC) WHERE "isCurrent" = true AND "isDeleted" = false;',
  ],
  [
    '20261106206200_trending_hashtags_lookup_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_hashtags_lookup_idx" ON "trending_hashtags" ("platform", "lookupKey") WHERE "isDeleted" = false;',
  ],
  [
    '20261106207100_trending_sounds_current_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_sounds_current_idx" ON "trending_sounds" ("createdAt" DESC) WHERE "isCurrent" = true AND "isDeleted" = false;',
  ],
  [
    '20261106207200_trending_sounds_lookup_idx',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_sounds_lookup_idx" ON "trending_sounds" ("lookupKey") WHERE "isDeleted" = false;',
  ],
])('%s is a single concurrent index statement', (migration, expected) => {
  expect(statement(migration)).toBe(expected);
});
