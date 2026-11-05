/**
 * Seeds an isolated Postgres database with a scaled, relationally-consistent
 * dataset. SQL-side generation (generate_series) so 1000x loads in minutes.
 *
 *   bun --tsconfig-override=tsconfig.json run scripts/db-load/seed.ts --scale 10
 *
 * Refuses non-local databases and databases whose name does not contain
 * "test" (same guard as the isolated publish suite).
 */

import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../assert-isolated-db-url';
import { BASE_TENANTS, FANOUT, tenantCount, WHALE_ORG_INDEX } from './scale';

const ORG_CHUNK = 250;

type Step = {
  name: string;
  sql: (o1: number, o2: number, mult: number) => string;
};

const id = (prefix: string, ...parts: string[]) =>
  `md5('${prefix}'||${parts.join("||'_'||")})`;

/** Deterministic spread of createdAt over the last year, newest first by j. */
const ts = (j: string, spanDays = 365) =>
  `(now() - (((((${j})::bigint * 7919) % 10007)::float8) / 10007.0) * interval '${spanDays} days')`;

const F = FANOUT;

const STEPS: Step[] = [
  {
    name: 'users',
    sql: (a, b) => `
      INSERT INTO users (id, handle, email, "firstName", "createdAt", "updatedAt")
      SELECT ${id('user', 'o', 'u')}, 'u'||o||'_'||u, 'u'||o||'_'||u||'@load.test', 'User', ${ts('o*13+u')}, now()
      FROM generate_series(${a},${b}) o, generate_series(0,${F.members - 1}) u`,
  },
  {
    name: 'organizations',
    sql: (a, b) => `
      INSERT INTO organizations (id, "userId", label, slug, "createdAt", "updatedAt")
      SELECT ${id('org', 'o')}, ${id('user', 'o', '0')}, 'Org '||o, 'org-'||o, ${ts('o')}, now()
      FROM generate_series(${a},${b}) o`,
  },
  {
    name: 'organization_settings',
    sql: (a, b) => `
      INSERT INTO organization_settings (id, "organizationId", "subscriptionTier", "updatedAt")
      SELECT ${id('os', 'o')}, ${id('org', 'o')}, 'pro', now()
      FROM generate_series(${a},${b}) o`,
  },
  {
    name: 'subscriptions',
    sql: (a, b) => `
      INSERT INTO subscriptions (id, "organizationId", "userId", status, plan, "updatedAt")
      SELECT ${id('sub', 'o')}, ${id('org', 'o')}, ${id('user', 'o', '0')}, 'ACTIVE', 'pro', now()
      FROM generate_series(${a},${b}) o`,
  },
  {
    name: 'credit_balances',
    sql: (a, b) => `
      INSERT INTO credit_balances (id, "organizationId", balance, "updatedAt")
      SELECT ${id('cb', 'o')}, ${id('org', 'o')}, 5000, now()
      FROM generate_series(${a},${b}) o`,
  },
  {
    name: 'brands',
    sql: (a, b) => `
      INSERT INTO brands (id, "userId", "organizationId", slug, label, "createdAt", "updatedAt")
      SELECT ${id('brand', 'o', 'k')}, ${id('user', 'o', '0')}, ${id('org', 'o')}, 'brand-'||o||'-'||k, 'Brand '||k, ${ts('o*7+k')}, now()
      FROM generate_series(${a},${b}) o, generate_series(0,${F.brands - 1}) k`,
  },
  {
    name: 'members',
    sql: (a, b) => `
      INSERT INTO members (id, "organizationId", "userId", "roleId", "currentBrandId", "createdAt", "updatedAt")
      SELECT ${id('member', 'o', 'u')}, ${id('org', 'o')}, ${id('user', 'o', 'u')}, md5('role_owner'), ${id('brand', 'o', '0')}, ${ts('o*5+u')}, now()
      FROM generate_series(${a},${b}) o, generate_series(0,${F.members - 1}) u`,
  },
  {
    name: 'credentials',
    sql: (a, b) => `
      INSERT INTO credentials (id, "organizationId", "brandId", "userId", platform, "externalHandle", label, "isConnected", "createdAt", "updatedAt")
      SELECT ${id('cred', 'o', 'k', 'c')}, ${id('org', 'o')}, ${id('brand', 'o', 'k')}, ${id('user', 'o', '0')},
        (ARRAY['INSTAGRAM','TWITTER','TIKTOK','YOUTUBE','LINKEDIN'])[1 + (c % 5)]::"CredentialPlatform", 'handle_'||o||'_'||k||'_'||c, 'Account '||c, true, ${ts('o*3+k*11+c')}, now()
      FROM generate_series(${a},${b}) o, generate_series(0,${F.brands - 1}) k, generate_series(0,${F.credentialsPerBrand - 1}) c`,
  },
  {
    name: 'folders',
    sql: (a, b, m) => `
      INSERT INTO folders (id, "userId", "organizationId", "brandId", label, "createdAt", "updatedAt")
      SELECT ${id('folder', 'o', 'j')}, ${id('user', 'o', '0')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, 'Folder '||j, ${ts('o+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.folders * m}) j`,
  },
  {
    name: 'ingredients',
    sql: (a, b, m) => `
      INSERT INTO ingredients (id, "userId", "organizationId", "brandId", "folderId", category, status, scope, origin, "isDeleted", "createdAt", "updatedAt")
      SELECT ${id('ing', 'o', 'j')}, ${id('user', 'o', 'j%3')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')},
        CASE WHEN j % 4 = 0 THEN ${id('folder', 'o', '1+(j%5)')} END,
        (ARRAY['IMAGE','VIDEO','MUSIC','GIF','AVATAR','VOICE'])[1 + (j % 6)]::"IngredientCategory",
        (ARRAY['GENERATED','UPLOADED','PROCESSING','VALIDATED'])[1 + (j % 4)]::"IngredientStatus",
        (ARRAY['BRAND','ORGANIZATION','USER'])[1 + (j % 3)]::"AssetScope",
        (ARRAY['GENERATED','UPLOADED'])[1 + (j % 2)]::"IngredientOrigin",
        (j % 20 = 0), ${ts('o*17+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.ingredients * m}) j`,
  },
  {
    name: 'metadata',
    sql: (a, b, m) => `
      INSERT INTO metadata (id, label, extension, width, height, duration, size, "createdAt", "updatedAt")
      SELECT ${id('meta', 'o', 'j')}, 'meta '||j, (ARRAY['MP4','JPG','PNG','MP3'])[1 + (j % 4)]::"MetadataExtension", 1080, 1920, 12.5, 2048000, ${ts('o*17+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.ingredients * m}) j`,
  },
  {
    name: 'ingredients.metadataId',
    sql: (a, b, m) => `
      UPDATE ingredients i SET "metadataId" = ${id('meta', 'g.o', 'g.j')}
      FROM (SELECT o, j FROM generate_series(${a},${b}) o, generate_series(1,${F.ingredients * m}) j) g
      WHERE i.id = ${id('ing', 'g.o', 'g.j')}`,
  },
  {
    name: 'assets',
    sql: (a, b, m) => `
      INSERT INTO assets (id, "userId", "parentType", "parentOrgId", "parentBrandId", category, "createdAt", "updatedAt")
      SELECT ${id('asset', 'o', 'j')}, ${id('user', 'o', '0')}, (ARRAY['ORGANIZATION','BRAND'])[1 + (j % 2)]::"AssetParent",
        ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, (ARRAY['LOGO','BANNER','REFERENCE','FONT'])[1 + (j % 4)]::"AssetCategory", ${ts('o*19+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.assets * m}) j`,
  },
  {
    name: 'articles',
    sql: (a, b, m) => `
      INSERT INTO articles (id, "userId", "organizationId", "brandId", label, slug, summary, status, "isDeleted", "createdAt", "updatedAt")
      SELECT ${id('art', 'o', 'j')}, ${id('user', 'o', '0')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, 'Article '||j, 'article-'||o||'-'||j,
        'Summary about topic '||(j % 37)||' for content marketing',
        (ARRAY['DRAFT','PUBLISHED','ARCHIVED'])[1 + (j % 3)]::"ArticleStatus", (j % 25 = 0), ${ts('o*23+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.articles * m}) j`,
  },
  {
    name: 'posts',
    sql: (a, b, m) => `
      INSERT INTO posts (id, "userId", "organizationId", "brandId", "credentialId", platform, description, label, status, "targetExecutionState",
        "parentId", "scheduledDate", "publishedAt", "publicationDate", category, "isDeleted", "analyticsNextCollectAt", "createdAt", "updatedAt")
      SELECT ${id('post', 'o', 'j')}, ${id('user', 'o', 'j%3')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')},
        ${id('cred', 'o', 'j%2', 'j%3')}, (ARRAY['instagram','twitter','tiktok','youtube','linkedin'])[1 + (j % 3)],
        'Post copy number '||j||' about topic '||(j % 41), 'Post '||j,
        (ARRAY['draft','public','scheduled','failed'])[1 + (j % 4)],
        (ARRAY['draft','published','scheduled','published','failed','published','draft','published'])[1 + (j % 8)],
        CASE WHEN j % 5 = 0 THEN ${id('post', 'o', 'j-1')} END,
        CASE WHEN j % 8 = 2 THEN
          CASE WHEN (o * 7 + j) % 400 = 0 THEN now() - interval '3 minutes' ELSE now() + (1 + j % 400) * interval '1 hour' END
        ELSE now() - (j % 400) * interval '1 hour' END,
        CASE WHEN j % 8 IN (1,3,5,7) THEN now() - (j % 4000) * interval '30 minutes' END,
        CASE WHEN j % 8 IN (1,3,5,7) THEN now() - (j % 4000) * interval '30 minutes' END,
        (ARRAY['POST','IMAGE','VIDEO','REEL','TEXT'])[1 + (j % 5)]::"PostCategory",
        (j % 20 = 0),
        now() + ((j % 96) - 48) * interval '1 hour',
        ${ts('o*29+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.posts * m}) j`,
  },
  {
    name: 'post_ingredients',
    sql: (a, b, m) => `
      INSERT INTO post_ingredients (id, "postId", "ingredientId", "organizationId", position, "createdAt")
      SELECT ${id('pi', 'o', 'j', 'p')}, ${id('post', 'o', 'j')}, ${id('ing', 'o', `1+((j*2+p)%${F.ingredients * m})`)}, ${id('org', 'o')}, p, ${ts('o+j')}
      FROM generate_series(${a},${b}) o, generate_series(1,${F.posts * m}) j, generate_series(0,1) p
      WHERE j % 2 = 0`,
  },
  {
    name: 'post_analytics',
    sql: (a, b, m) => `
      INSERT INTO post_analytics (id, "postId", "userId", "organizationId", "brandId", platform, date, "totalViews", "totalLikes", "totalComments", "totalShares", "engagementRate", "createdAt", "updatedAt")
      SELECT ${id('pa', 'o', 'j', 'd')}, ${id('post', 'o', 'j')}, ${id('user', 'o', 'j%3')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')},
        (ARRAY['INSTAGRAM','TWITTER','TIKTOK'])[1 + (j % 3)]::"CredentialPlatform",
        date_trunc('day', now()) - (d * (1 + j % 5)) * interval '1 day', 100 * (d+1) + j % 977, 10 * (d+1) + j % 97, j % 31, j % 17, (j % 100) / 10.0, now(), now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.posts * m}) j, generate_series(0,${F.postAnalyticsPerPublishedPost - 1}) d
      WHERE j % 8 IN (1,3,5,7) AND j % 20 <> 0`,
  },
  {
    name: 'activities',
    sql: (a, b, m) => `
      INSERT INTO activities (id, "userId", "organizationId", "brandId", "entityId", "entityModel", action, "createdAt", "updatedAt")
      SELECT ${id('act', 'o', 'j')}, ${id('user', 'o', 'j%3')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, ${id('post', 'o', `1+(j%${F.posts * m})`)},
        'Post', (ARRAY['created','updated','published','deleted'])[1 + (j % 4)], ${ts('o*31+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.activities * m}) j`,
  },
  {
    name: 'credit_transactions',
    sql: (a, b, m) => `
      INSERT INTO credit_transactions (id, "organizationId", amount, "balanceAfter", source, category, "brandId", "createdAt", "updatedAt")
      SELECT ${id('ct', 'o', 'j')}, ${id('org', 'o')}, CASE WHEN j % 5 = 0 THEN 1000 ELSE -(1 + j % 25) END, 5000 - j, (ARRAY['generation','purchase','refund','workflow'])[1 + (j % 4)],
        (ARRAY['image','video','text'])[1 + (j % 3)], ${id('brand', 'o', 'j%2')}, ${ts('o*37+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.creditTransactions * m}) j`,
  },
  {
    name: 'agent_threads',
    sql: (a, b, m) => `
      INSERT INTO agent_threads (id, "userId", "organizationId", "brandId", title, status, "createdAt", "updatedAt")
      SELECT ${id('thread', 'o', 'j')}, ${id('user', 'o', 'j%3')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, 'Thread '||j,
        (ARRAY['active','archived'])[1 + (j % 2)], ${ts('o*41+j')}, now() - (j % 100) * interval '1 hour'
      FROM generate_series(${a},${b}) o, generate_series(1,${F.agentThreads * m}) j`,
  },
  {
    name: 'agent_messages',
    sql: (a, b, m) => `
      INSERT INTO agent_messages (id, "threadId", "organizationId", "userId", "brandId", role, content, "createdAt", "updatedAt")
      SELECT ${id('msg', 'o', 'j', 'k')}, ${id('thread', 'o', 'j')}, ${id('org', 'o')}, ${id('user', 'o', 'j%3')}, ${id('brand', 'o', 'j%2')},
        CASE WHEN k % 2 = 0 THEN 'user' ELSE 'assistant' END, 'Message '||k||' in thread '||j,
        now() - (j % 300) * interval '1 day' + k * interval '1 minute', now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.agentThreads * m}) j, generate_series(1,${F.agentMessagesPerThread}) k`,
  },
  {
    name: 'workflows',
    sql: (a, b, _m) => `
      INSERT INTO workflows (id, "userId", "organizationId", "brandId", label, status, "currentVersionId", "createdAt", "updatedAt")
      SELECT ${id('wf', 'o', 'j')}, ${id('user', 'o', '0')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, 'Workflow '||j, 'active', ${id('wfv', 'o', 'j')}, ${ts('o+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.workflows}) j`,
  },
  {
    name: 'workflow_versions',
    sql: (a, b) => `
      INSERT INTO workflow_versions (id, "workflowId", "organizationId", "userId", version, graph, "contentHash", "createdAt")
      SELECT ${id('wfv', 'o', 'j')}, ${id('wf', 'o', 'j')}, ${id('org', 'o')}, ${id('user', 'o', '0')}, 1, '{"nodes":[],"edges":[]}'::jsonb, md5('h'||o||j), ${ts('o+j')}
      FROM generate_series(${a},${b}) o, generate_series(1,${F.workflows}) j`,
  },
  {
    name: 'workflow_executions',
    sql: (a, b, m) => `
      INSERT INTO workflow_executions (id, "workflowId", "userId", "organizationId", "workflowVersionId", status, "startedAt", "completedAt", "createdAt", "updatedAt", "durationMs", "creditsUsed")
      SELECT ${id('wx', 'o', 'j')}, ${id('wf', 'o', `1+(j%${F.workflows})`)}, ${id('user', 'o', 'j%3')}, ${id('org', 'o')}, ${id('wfv', 'o', `1+(j%${F.workflows})`)},
        (ARRAY['COMPLETED','COMPLETED','COMPLETED','RUNNING','FAILED','PENDING'])[1 + (j % 6)]::"WorkflowExecutionStatus",
        ${ts('o*43+j', 90)}, ${ts('o*43+j', 90)} + interval '2 minutes', ${ts('o*43+j', 90)}, now(), 120000, j % 40
      FROM generate_series(${a},${b}) o, generate_series(1,${F.workflowExecutions * m}) j`,
  },
  {
    name: 'workflow_execution_node_results',
    sql: (a, b, m) => `
      INSERT INTO workflow_execution_node_results (id, "organizationId", "executionId", "nodeId", "nodeType", status, "createdAt", "updatedAt")
      SELECT ${id('wn', 'o', 'j', 'k')}, ${id('org', 'o')}, ${id('wx', 'o', 'j')}, 'node-'||k, 'generate', 'completed', ${ts('o*43+j', 90)}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.workflowExecutions * m}) j, generate_series(1,${F.nodeResultsPerExecution}) k`,
  },
  {
    name: 'tasks',
    sql: (a, b, m) => `
      INSERT INTO tasks (id, "organizationId", "brandId", "userId", title, status, priority, "createdAt", "updatedAt")
      SELECT ${id('task', 'o', 'j')}, ${id('org', 'o')}, ${id('brand', 'o', 'j%2')}, ${id('user', 'o', 'j%3')}, 'Task '||j,
        (ARRAY['todo','in_progress','done'])[1 + (j % 3)], 'medium', ${ts('o*47+j')}, now()
      FROM generate_series(${a},${b}) o, generate_series(1,${F.tasks * m}) j`,
  },
  {
    name: 'notification_events',
    sql: (a, b, m) => `
      INSERT INTO notification_events (id, "organizationId", "eventKey", "deduplicationKey", "sourceType", "sourceId", payload, "occurredAt", "createdAt", "updatedAt")
      SELECT ${id('ne', 'o', 'u', 'j')}, ${id('org', 'o')}, 'post.published', 'dk'||o||'_'||u||'_'||j, 'post', ${id('post', 'o', `1+(j%${F.posts})`)}, '{}'::jsonb, ${ts('o*53+u*7+j', 120)}, now(), now()
      FROM generate_series(${a},${b}) o, generate_series(0,${F.members - 1}) u, generate_series(1,${F.inboxItemsPerMember * m}) j`,
  },
  {
    name: 'notification_inbox_items',
    sql: (a, b, m) => `
      INSERT INTO notification_inbox_items (id, "eventId", "userId", "organizationId", topic, "occurredAt", "readAt", "createdAt", "updatedAt")
      SELECT ${id('ni', 'o', 'u', 'j')}, ${id('ne', 'o', 'u', 'j')}, ${id('user', 'o', 'u')}, ${id('org', 'o')}, 'publishing',
        ${ts('o*53+u*7+j', 120)}, CASE WHEN j % 3 = 0 THEN now() END, now(), now()
      FROM generate_series(${a},${b}) o, generate_series(0,${F.members - 1}) u, generate_series(1,${F.inboxItemsPerMember * m}) j`,
  },
];

/**
 * Realism adjustments applied after the bulk load. The generic generators give
 * every execution a spread of statuses; in production PENDING executions are a
 * tiny, mostly recent set, and most executions are system (agent-turn) runs
 * whose `result.metadata` carries the dispatch class the sweeps filter on.
 */
const FINALIZE_SQL = [
  `UPDATE workflow_executions SET status = 'COMPLETED' WHERE status = 'PENDING' AND hashtext(id) % 500 <> 0`,
  `UPDATE workflow_executions SET result = jsonb_build_object('metadata', jsonb_build_object('isSystemAction', true, 'dispatchClass', 'INTERACTIVE', 'canonicalId', 'agent.turn.execute')) WHERE hashtext(id) % 3 <> 0`,
];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scaleArg = args[args.indexOf('--scale') + 1];
  const scale = Number(scaleArg);
  if (!Number.isFinite(scale) || scale < 1) {
    throw new Error(
      'usage: seed.ts --scale <1|10|100|1000> [--url postgres://…]',
    );
  }
  const urlIdx = args.indexOf('--url');
  const url = assertIsolatedDatabaseUrl(
    urlIdx >= 0 ? args[urlIdx + 1] : process.env.DATABASE_URL,
  );

  const client = new Client({ connectionString: url });
  await client.connect();
  if (args.includes('--finalize-only')) {
    for (const sql of FINALIZE_SQL) await client.query(sql);
    await client.query('ANALYZE workflow_executions');
    await client.end();
    return;
  }
  await client.query("SET session_replication_role = 'replica'"); // FK integrity is by construction
  await client.query("SET maintenance_work_mem = '1GB'");

  const started = Date.now();
  await client.query(
    `INSERT INTO roles (id, label, key, "updatedAt") VALUES (md5('role_owner'), 'Owner', 'owner', now()) ON CONFLICT DO NOTHING`,
  );

  // Org indices: 0 = whale (fan-out * scale), 1..tenantCount = regular tenants.
  const tenants = tenantCount(scale);
  const run = async (name: string, o1: number, o2: number, mult: number) => {
    const step = STEPS.find((s) => s.name === name);
    if (!step) throw new Error(name);
    await client.query(step.sql(o1, o2, mult));
  };

  for (const step of STEPS) {
    const t0 = Date.now();
    // whale first (mult = scale), then regular tenants in chunks
    await run(step.name, WHALE_ORG_INDEX, WHALE_ORG_INDEX, scale);
    for (let o = 1; o <= tenants; o += ORG_CHUNK) {
      await run(step.name, o, Math.min(o + ORG_CHUNK - 1, tenants), 1);
    }
    process.stdout.write(
      `seeded ${step.name.padEnd(36)} ${((Date.now() - t0) / 1000).toFixed(1)}s\n`,
    );
  }

  for (const sql of FINALIZE_SQL) await client.query(sql);
  await client.query("SET session_replication_role = 'origin'");
  process.stdout.write('ANALYZE…\n');
  await client.query('ANALYZE');
  const size = await client.query(
    'select pg_size_pretty(pg_database_size(current_database())) as size',
  );
  process.stdout.write(
    `done: scale=${scale}x tenants=${tenants}(+whale) base=${BASE_TENANTS} in ${((Date.now() - started) / 1000).toFixed(0)}s, db size ${size.rows[0].size}\n`,
  );
  await client.end();
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
