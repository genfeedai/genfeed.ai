/**
 * Normalize Mongo collection names across split databases.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * Usage:
 *   bun run scripts/migrations/normalize-mongo-collection-names.ts
 *   bun run scripts/migrations/normalize-mongo-collection-names.ts --db=cloud
 *   bun run scripts/migrations/normalize-mongo-collection-names.ts --env=production
 *   bun run scripts/migrations/normalize-mongo-collection-names.ts --env=production --db=all --live
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db, MongoClient } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

const DATABASE_NAMES = ['cloud', 'agent', 'auth', 'crm'] as const;
type DatabaseName = (typeof DATABASE_NAMES)[number];

interface RenamePlan {
  from: string;
  to: string;
}

interface DropEmptyStalePlan {
  collection: string;
  reason: string;
}

interface NoopPlan {
  collection: string;
  reason: string;
}

interface DatabaseManifest {
  rename: RenamePlan[];
  dropEmptyStale: DropEmptyStalePlan[];
  noop: NoopPlan[];
}

interface ParsedArgs {
  db: DatabaseName | 'all';
  dryRun: boolean;
  env: 'local' | 'production';
  uri?: string;
}

interface ActionResult {
  action: 'rename' | 'drop-empty-stale' | 'noop';
  collection: string;
  detail: string;
  status: 'applied' | 'failed' | 'noop';
}

export const MANIFEST: Record<DatabaseName, DatabaseManifest> = {
  agent: {
    dropEmptyStale: [],
    noop: [],
    rename: [
      { from: 'rooms', to: 'agent-threads' },
      { from: 'agent_threads', to: 'agent-threads' },
      { from: 'messages', to: 'agent-messages' },
      { from: 'agent_messages', to: 'agent-messages' },
      { from: 'goals', to: 'agent-goals' },
      { from: 'agent_goals', to: 'agent-goals' },
      { from: 'memories', to: 'agent-memories' },
      { from: 'agent_memories', to: 'agent-memories' },
      { from: 'campaigns', to: 'agent-campaigns' },
      { from: 'agent_campaigns', to: 'agent-campaigns' },
      { from: 'strategies', to: 'agent-strategies' },
      { from: 'agent_strategies', to: 'agent-strategies' },
      {
        from: 'strategy_opportunities',
        to: 'agent-strategy-opportunities',
      },
      {
        from: 'agent_strategy_opportunities',
        to: 'agent-strategy-opportunities',
      },
      { from: 'strategy_reports', to: 'agent-strategy-reports' },
      {
        from: 'agent_strategy_reports',
        to: 'agent-strategy-reports',
      },
      { from: 'runs', to: 'agent-runs' },
      { from: 'agent_runs', to: 'agent-runs' },
      { from: 'requests', to: 'agent-input-requests' },
      { from: 'agent_input_requests', to: 'agent-input-requests' },
      { from: 'thread_snapshots', to: 'agent-thread-snapshots' },
      { from: 'agent_thread_snapshots', to: 'agent-thread-snapshots' },
      { from: 'session_bindings', to: 'agent-session-bindings' },
      { from: 'agent_session_bindings', to: 'agent-session-bindings' },
      { from: 'thread_events', to: 'agent-thread-events' },
      { from: 'agent_thread_events', to: 'agent-thread-events' },
      { from: 'profile_snapshots', to: 'agent-profile-snapshots' },
      { from: 'agent_profile_snapshots', to: 'agent-profile-snapshots' },
    ],
  },
  auth: {
    dropEmptyStale: [],
    noop: [
      { collection: 'users', reason: 'Canonical auth collection.' },
      { collection: 'organizations', reason: 'Canonical auth collection.' },
      { collection: 'members', reason: 'Canonical auth collection.' },
      { collection: 'profiles', reason: 'Canonical auth collection.' },
      { collection: 'roles', reason: 'Canonical auth collection.' },
      { collection: 'settings', reason: 'Canonical auth collection.' },
      {
        collection: 'organization-settings',
        reason: 'Canonical auth collection.',
      },
      { collection: 'api-keys', reason: 'Canonical auth collection.' },
      {
        collection: 'user-subscriptions',
        reason: 'Canonical auth collection.',
      },
    ],
    rename: [],
  },
  cloud: {
    dropEmptyStale: [
      {
        collection: 'organizations',
        reason: 'Canonical ownership moved to the auth database.',
      },
      {
        collection: 'users',
        reason: 'Canonical ownership moved to the auth database.',
      },
      {
        collection: 'strategies',
        reason: 'Canonical ownership moved to the agent database.',
      },
      {
        collection: 'agent-strategies',
        reason: 'Canonical ownership moved to the agent database.',
      },
      {
        collection: 'tasks',
        reason: 'Canonical ownership moved to the crm database.',
      },
    ],
    noop: [
      {
        collection: 'runs',
        reason:
          'Canonical cloud Run collection; never drop this collection here.',
      },
      {
        collection: 'outreach-campaigns',
        reason: 'Already canonical when present.',
      },
    ],
    rename: [
      { from: 'orgintegrations', to: 'org-integrations' },
      { from: 'campaign_targets', to: 'campaign-targets' },
      { from: 'reply_bot_configs', to: 'reply-bot-configs' },
      { from: 'content_performance', to: 'content-performance' },
      { from: 'livestream_bot_sessions', to: 'livestream-bot-sessions' },
      { from: 'outreach_campaigns', to: 'outreach-campaigns' },
      { from: 'bot_activities', to: 'bot-activities' },
      { from: 'brand_memory', to: 'brand-memory' },
      { from: 'creative_patterns', to: 'creative-patterns' },
      { from: 'content_runs', to: 'content-runs' },
      { from: 'batch_workflow_jobs', to: 'batch-workflow-jobs' },
      { from: 'content_skills', to: 'content-skills' },
      { from: 'processed_tweets', to: 'processed-tweets' },
      { from: 'monitored_accounts', to: 'monitored-accounts' },
      { from: 'trendpreferences', to: 'trend-preferences' },
      { from: 'trendinghashtags', to: 'trending-hashtags' },
      { from: 'trendingsounds', to: 'trending-sounds' },
      { from: 'trendingvideos', to: 'trending-videos' },
    ],
  },
  crm: {
    dropEmptyStale: [],
    noop: [],
    rename: [{ from: 'tasks', to: 'crm-tasks' }],
  },
};

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const db = args.find((arg) => arg.startsWith('--db='))?.split('=')[1];
  const env = args.find((arg) => arg.startsWith('--env='))?.split('=')[1];
  const uri = args.find((arg) => arg.startsWith('--uri='))?.split('=')[1];

  const parsedDb = db ?? 'all';
  if (
    parsedDb !== 'all' &&
    !DATABASE_NAMES.includes(parsedDb as DatabaseName)
  ) {
    throw new Error(
      `Invalid --db value "${parsedDb}". Expected one of: all, ${DATABASE_NAMES.join(', ')}`,
    );
  }

  const parsedEnv = (env ?? 'local') as ParsedArgs['env'];
  if (parsedEnv !== 'local' && parsedEnv !== 'production') {
    throw new Error(
      `Invalid --env value "${parsedEnv}". Expected "local" or "production".`,
    );
  }

  return {
    db: parsedDb as ParsedArgs['db'],
    dryRun: !args.includes('--live'),
    env: parsedEnv,
    uri,
  };
}

function loadMongoUri(
  envSuffix: ParsedArgs['env'],
  overrideUri?: string,
): string {
  if (overrideUri) {
    return overrideUri;
  }

  const envPath = resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`);
  const content = readFileSync(envPath, 'utf8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key === 'MONGODB_URI' && value) {
      return value;
    }
  }

  throw new Error(`MONGODB_URI not found in ${envPath}`);
}

function maskMongoUri(uri: string): string {
  return uri.replace(/\/\/[^:]+:[^@]+@/, '//*****:*****@');
}

function uriForDatabase(uri: string, database: DatabaseName): string {
  const parsed = new URL(uri);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const matches = await db.listCollections({ name }).toArray();
  return matches.length > 0;
}

async function collectionCount(db: Db, name: string): Promise<number> {
  return await db.collection(name).countDocuments();
}

async function dropCollection(
  db: Db,
  name: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }

  await db.collection(name).drop();
}

async function renameCollection(
  db: Db,
  from: string,
  to: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }

  await db.collection(from).rename(to);
}

async function executeRename(
  db: Db,
  plan: RenamePlan,
  dryRun: boolean,
): Promise<ActionResult> {
  const sourceExists = await collectionExists(db, plan.from);
  const targetExists = await collectionExists(db, plan.to);

  if (!sourceExists && !targetExists) {
    return {
      action: 'rename',
      collection: plan.from,
      detail: `${plan.from} missing; ${plan.to} missing`,
      status: 'noop',
    };
  }

  if (!sourceExists && targetExists) {
    const targetCount = await collectionCount(db, plan.to);
    return {
      action: 'rename',
      collection: plan.to,
      detail: `already canonical (${plan.to}, ${targetCount} docs)`,
      status: 'noop',
    };
  }

  const sourceCount = await collectionCount(db, plan.from);

  if (!targetExists) {
    await renameCollection(db, plan.from, plan.to, dryRun);
    return {
      action: 'rename',
      collection: plan.from,
      detail: `${dryRun ? 'would rename' : 'renamed'} ${plan.from} -> ${plan.to} (${sourceCount} docs)`,
      status: 'applied',
    };
  }

  const targetCount = await collectionCount(db, plan.to);

  if (sourceCount > 0 && targetCount > 0) {
    return {
      action: 'rename',
      collection: plan.from,
      detail: `collision: ${plan.from} (${sourceCount} docs) and ${plan.to} (${targetCount} docs) both contain data`,
      status: 'failed',
    };
  }

  if (sourceCount === 0) {
    await dropCollection(db, plan.from, dryRun);
    return {
      action: 'rename',
      collection: plan.from,
      detail: `${dryRun ? 'would drop' : 'dropped'} empty legacy duplicate because ${plan.to} already exists (${targetCount} docs)`,
      status: 'applied',
    };
  }

  await dropCollection(db, plan.to, dryRun);
  await renameCollection(db, plan.from, plan.to, dryRun);
  return {
    action: 'rename',
    collection: plan.from,
    detail: `${dryRun ? 'would replace empty target and rename' : 'replaced empty target and renamed'} ${plan.from} -> ${plan.to} (${sourceCount} docs)`,
    status: 'applied',
  };
}

async function executeDropEmptyStale(
  db: Db,
  plan: DropEmptyStalePlan,
  dryRun: boolean,
): Promise<ActionResult> {
  const exists = await collectionExists(db, plan.collection);
  if (!exists) {
    return {
      action: 'drop-empty-stale',
      collection: plan.collection,
      detail: 'collection missing',
      status: 'noop',
    };
  }

  const count = await collectionCount(db, plan.collection);
  if (count > 0) {
    return {
      action: 'drop-empty-stale',
      collection: plan.collection,
      detail: `non-empty wrong-DB leftover (${count} docs): ${plan.reason}`,
      status: 'failed',
    };
  }

  await dropCollection(db, plan.collection, dryRun);
  return {
    action: 'drop-empty-stale',
    collection: plan.collection,
    detail: `${dryRun ? 'would drop' : 'dropped'} empty stale collection: ${plan.reason}`,
    status: 'applied',
  };
}

async function executeNoop(db: Db, plan: NoopPlan): Promise<ActionResult> {
  const exists = await collectionExists(db, plan.collection);
  const count = exists ? await collectionCount(db, plan.collection) : 0;

  return {
    action: 'noop',
    collection: plan.collection,
    detail: exists
      ? `left unchanged (${count} docs): ${plan.reason}`
      : `not present: ${plan.reason}`,
    status: 'noop',
  };
}

function selectedDatabases(db: ParsedArgs['db']): DatabaseName[] {
  return db === 'all' ? [...DATABASE_NAMES] : [db];
}

async function runForDatabase(
  uri: string,
  database: DatabaseName,
  manifest: DatabaseManifest,
  dryRun: boolean,
): Promise<ActionResult[]> {
  const { MongoClient } = await import('mongodb');
  const dbUri = uriForDatabase(uri, database);
  logger.log(`\n📦 Database: ${database}`);
  logger.log(`   URI: ${maskMongoUri(dbUri)}`);

  const client: MongoClient = new MongoClient(dbUri);
  await client.connect();

  try {
    const db = client.db(database);
    const results: ActionResult[] = [];

    for (const plan of manifest.rename) {
      results.push(await executeRename(db, plan, dryRun));
    }

    for (const plan of manifest.dropEmptyStale) {
      results.push(await executeDropEmptyStale(db, plan, dryRun));
    }

    for (const plan of manifest.noop) {
      results.push(await executeNoop(db, plan));
    }

    return results;
  } finally {
    await client.close();
  }
}

function logResults(database: DatabaseName, results: ActionResult[]): void {
  logger.log(`\n📋 ${database} results`);
  for (const result of results) {
    const prefix =
      result.status === 'failed'
        ? '❌'
        : result.status === 'applied'
          ? '🔄'
          : '⏭️';
    logger.log(
      `${prefix} [${result.action}] ${result.collection}: ${result.detail}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const uri = loadMongoUri(args.env, args.uri);

  logger.log(`Environment: ${args.env}`);
  logger.log(`Mode: ${args.dryRun ? 'dry-run' : 'live'}`);
  logger.log(`Root URI: ${maskMongoUri(uri)}`);
  logger.log(`Selected DBs: ${selectedDatabases(args.db).join(', ')}`);

  let failureCount = 0;

  for (const database of selectedDatabases(args.db)) {
    const results = await runForDatabase(
      uri,
      database,
      MANIFEST[database],
      args.dryRun,
    );
    logResults(database, results);
    failureCount += results.filter(
      (result) => result.status === 'failed',
    ).length;
  }

  if (failureCount > 0) {
    throw new Error(
      `Collection normalization encountered ${failureCount} blocking issue(s).`,
    );
  }

  logger.log(
    '\n✅ Collection normalization completed without blocking issues.',
  );
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  main().catch((error) => {
    logger.error('Normalization failed:', error);
    process.exit(1);
  });
}
