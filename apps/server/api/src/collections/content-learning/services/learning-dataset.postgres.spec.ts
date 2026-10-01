import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LearningDatasetService } from '@api/collections/content-learning/services/learning-dataset.service';
import {
  LearningDependencyService,
  learningFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertIsolatedDatabaseUrl } from '@api-test/../scripts/assert-isolated-db-url';
import { CredentialPlatform, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

const explicitUrl = process.env.LEARNING_DATASET_TEST_DATABASE_URL;
const benchmark = process.env.LEARNING_DATASET_BENCHMARK === '1';
const cutoff = '2026-09-29T00:00:00.000Z';
const numericRow = (index: number) => ({
  sourceFingerprint: `owned-${index}`,
  accountGroup: `owned-account-${index % 10}`,
  decisionAt: '2026-09-01T00:00:00.000Z',
  measuredAt: '2026-09-03T00:00:00.000Z',
  features: [1, 0, 1, 0, 1, 0, 1, 0, 1],
  armId: 'baseline-v1',
  probabilities: {
    'baseline-v1': 1,
    'question-example-v1': 0,
    'proof-steps-v1': 0,
  },
  reward: 0.5,
  synthetic: false,
});
const tables = new Set([
  'users',
  'organizations',
  'brands',
  'credentials',
  'posts',
  'content_learning_accounts',
  'content_learning_consents',
  'content_learning_decisions',
  'content_learning_checkpoints',
  'content_learning_baselines',
  'content_learning_rewards',
  'content_learning_datasets',
  'content_learning_dataset_entries',
  'content_learning_operations',
  'content_learning_dependencys',
]);
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe.skipIf(!explicitUrl)(
  'dataset atomic scalability on isolated PostgreSQL',
  () => {
    let pool: Pool, prisma: PrismaClient, service: LearningDatasetService;
    let statements: string[] = [];
    const schema = `dataset_5781_${process.pid}_${Date.now()}`;
    const input = {
      organizationId: 'org-0',
      actorId: 'actor',
      requestId: '',
      rightsStatement: 'Isolated fixture owned rights',
      profile: 'awareness',
      cell: 'test-cell',
      cutoff,
    };
    const sources = Array.from({ length: 10 }, (_, i) => ({
      organizationId: `org-${i % 2}`,
      accountId: `account-${i}`,
    }));
    beforeAll(async () => {
      const url = assertIsolatedDatabaseUrl(explicitUrl);
      pool = new Pool({
        connectionString: url,
        max: 5,
        options: `-c search_path=${schema}`,
      });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      // Generate exact current table definitions/indexes/FKs from the canonical schema.
      // Only this lane's tables are installed; unrelated tables/providers are unnecessary.
      const schemaFile = fileURLToPath(
        new URL(
          '../../../../../../../packages/prisma/prisma/schema.prisma',
          import.meta.url,
        ),
      );
      const ddl = execFileSync(
        'bun',
        [
          'x',
          'prisma',
          'migrate',
          'diff',
          '--from-empty',
          '--to-schema',
          schemaFile,
          '--script',
        ],
        {
          cwd: fileURLToPath(
            new URL('../../../../../../../packages/prisma', import.meta.url),
          ),
          env: { ...process.env, DATABASE_URL: url },
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      for (const statement of ddl.split(';')) {
        const clean = statement.replace(/^\s*--[^\n]*\n/gm, '').trim();
        if (!clean) continue;
        if (/^CREATE TYPE /.test(clean)) {
          await pool.query(clean);
          continue;
        }
        const create = clean.match(/^CREATE TABLE "(?:public"\.")?([^".]+)"/);
        const index = clean.match(
          /^CREATE (?:UNIQUE )?INDEX .* ON "(?:public"\.")?([^".]+)"/,
        );
        const foreign = clean.match(
          /^ALTER TABLE "(?:public"\.")?([^".]+)".*REFERENCES "(?:public"\.")?([^".]+)"/s,
        );
        if (
          (create && tables.has(create[1])) ||
          (index && tables.has(index[1])) ||
          (foreign && tables.has(foreign[1]) && tables.has(foreign[2]))
        )
          await pool.query(clean.replaceAll('"public".', `"${schema}".`));
      }
      prisma = new PrismaClient({
        adapter: new PrismaPg(pool, { schema }),
        log: [{ emit: 'event', level: 'query' }],
      });
      prisma.$on('query', (event) => statements.push(event.query));
      service = new LearningDatasetService(
        prisma as unknown as PrismaService,
        new LearningDependencyService(prisma as unknown as PrismaService),
      );
      await prisma.user.create({
        data: { id: 'actor', handle: 'dataset-fixture' },
      });
      for (let i = 0; i < 2; i++) {
        await prisma.organization.create({
          data: {
            id: `org-${i}`,
            userId: 'actor',
            label: `Org ${i}`,
            slug: `org-${i}`,
          },
        });
        await prisma.brand.create({
          data: {
            id: `brand-${i}`,
            userId: 'actor',
            organizationId: `org-${i}`,
            label: `Brand ${i}`,
            slug: `brand-${i}`,
          },
        });
      }
      for (let i = 0; i < 10; i++) {
        const scope = {
          organizationId: `org-${i % 2}`,
          brandId: `brand-${i % 2}`,
          credentialId: `credential-${i}`,
        };
        await prisma.credential.create({
          data: {
            id: scope.credentialId,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            userId: 'actor',
            platform: CredentialPlatform.TWITTER,
          },
        });
        await prisma.contentLearningAccount.create({
          data: { id: `account-${i}`, ...scope, sharingConsentVersion: 1 },
        });
        await prisma.contentLearningConsent.create({
          data: {
            id: `consent-${i}`,
            ...scope,
            accountId: `account-${i}`,
            version: 1,
            granted: true,
            actorId: 'actor',
            noticeVersion: 'fixture',
            grantedAt: new Date('2026-08-01'),
          },
        });
      }
    }, 120000);
    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });
    async function clearOutputs() {
      await pool.query(
        'DELETE FROM content_learning_dependencys WHERE "derivedKind" = \'dataset\'',
      );
      await prisma.contentLearningOperation.deleteMany();
      await prisma.contentLearningDatasetEntry.deleteMany();
      await prisma.contentLearningDataset.deleteMany();
    }
    async function seed(size: number) {
      await clearOutputs();
      for (const table of [
        'content_learning_dependencys',
        'content_learning_rewards',
        'content_learning_decisions',
        'content_learning_baselines',
        'content_learning_checkpoints',
        'posts',
      ])
        await pool.query(`DELETE FROM "${table}"`);
      await pool.query(
        `INSERT INTO posts (id,"userId","organizationId","brandId","credentialId","updatedAt") SELECT 'post-'||i,'actor','org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),NOW() FROM generate_series(0,$1::int-1) i`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_checkpoints (id,"organizationId","brandId","credentialId","postId","sourceAttemptId","dueAt","requestStartedAt","receivedAt",measurement,format,"publishedAt","organicProvenance","sourceFingerprint",validity,"updatedAt") SELECT 'checkpoint-'||i,'org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),'post-'||i,'attempt-'||i,NOW(),NOW(),NOW(),'{}','text',TIMESTAMP '2026-09-01','{}','checkpoint-fingerprint-'||i,'valid',NOW() FROM generate_series(0,$1::int-1) i`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_baselines (id,"organizationId","brandId","credentialId",fingerprint,"scopeKey",cutoff,"configVersion","contributorCheckpointIds","contributorRevisions",count,"medianExposure",samples,validity,"updatedAt") SELECT 'baseline-'||i,'org-'||(i%2),'brand-'||(i%2),'credential-'||i,'baseline-fingerprint-'||i,'scope-'||i,TIMESTAMP '2026-09-01','rl-reward-v1-experimental',ARRAY[]::text[],ARRAY[]::int[],20,1,'[]','valid',NOW() FROM generate_series(0,9) i`,
      );
      await pool.query(
        `INSERT INTO content_learning_decisions (id,"organizationId","brandId","credentialId","requestKey","destinationKey","candidateIndex","payloadHash","scopeKey",epoch,"accountRevision",mode,"contextVector","contextSnapshot","eligibleArmIds",probabilities,"selectedArmId","selectedProbability",assignment,"assignmentProbability","executionProbability","configVersion","baselineId",state,"createdAt","updatedAt") SELECT 'decision-'||i,'org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),'request-'||i,'destination',0,'payload-'||i,'scope-'||(i%10),0,0,'shadow',ARRAY[1,0,1,0,1,0,1,0,1]::float8[],'{}',ARRAY['baseline-v1'],'{"baseline-v1":1,"question-example-v1":0,"proof-steps-v1":0}','baseline-v1',1,'fixture',1,1,'ridge-epsilon-v1','baseline-'||(i%10),'published',TIMESTAMP '2026-09-01'+(i%100)*INTERVAL '1 second',NOW() FROM generate_series(0,$1::int-1) i`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_rewards (id,"organizationId","brandId","credentialId","decisionId",version,"checkpointId","baselineId","rawComponents","boundedComponents",composite,confidence,status,reasons,"sourceFingerprint","createdAt","updatedAt") SELECT 'reward-'||lpad(i::text,7,'0'),'org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),'decision-'||i,1,'checkpoint-'||i,'baseline-'||(i%10),'{}','{}',0.5,'{}','valid',ARRAY[]::text[],'reward-fingerprint-'||i,TIMESTAMP '2026-09-03',NOW() FROM generate_series(0,$1::int-1) i`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_dependencys (id,"sourceKind","sourceId","sourceVersion","sourceOrganizationId","derivedKind","derivedId","derivedOrganizationId","updatedAt") SELECT 'edge-'||i||'-'||e.kind,e.kind,CASE e.kind WHEN 'checkpoint' THEN 'checkpoint-'||i WHEN 'baseline' THEN 'baseline-'||(i%10) ELSE 'decision-'||i END,CASE e.kind WHEN 'checkpoint' THEN '0' WHEN 'baseline' THEN 'baseline-fingerprint-'||(i%10) ELSE 'payload-'||i END,'org-'||(i%10%2),'reward','reward-'||lpad(i::text,7,'0'),'org-'||(i%10%2),NOW() FROM generate_series(0,$1::int-1) i CROSS JOIN (VALUES ('checkpoint'),('baseline'),('decision')) e(kind)`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_dependencys (id,"sourceKind","sourceId","sourceVersion","sourceOrganizationId","derivedKind","derivedId","derivedOrganizationId","updatedAt") SELECT 'checkpoint-post-'||i,'post','post-'||i,'post-'||i,'org-'||(i%10%2),'checkpoint','checkpoint-'||i,'org-'||(i%10%2),NOW() FROM generate_series(0,$1::int-1) i`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_dependencys (id,"sourceKind","sourceId","sourceVersion","sourceOrganizationId","derivedKind","derivedId","derivedOrganizationId","updatedAt") SELECT 'config-'||k.kind||'-'||i,'config','numeric-nine-v1','numeric-nine-v1',NULL,k.kind,k.kind||'-'||i,'org-'||(i%10%2),NOW() FROM generate_series(0,$1::int-1) i CROSS JOIN (VALUES ('checkpoint'),('decision')) k(kind)`,
        [size],
      );
      await pool.query(
        `INSERT INTO content_learning_dependencys (id,"sourceKind","sourceId","sourceVersion","sourceOrganizationId","derivedKind","derivedId","derivedOrganizationId","updatedAt") SELECT 'baseline-contributor-'||i,'checkpoint','checkpoint-'||i,'0','org-'||(i%10%2),'baseline','baseline-'||(i%10),'org-'||(i%10%2),NOW() FROM generate_series(0,199) i`,
      );
      await pool.query('ANALYZE');
    }
    async function measure(
      size: number,
      kind: 'owned' | 'consented' | 'mixed',
      run: number,
    ) {
      const rows =
        kind === 'owned'
          ? Array.from({ length: size }, (_, i) => numericRow(i))
          : kind === 'mixed'
            ? [numericRow(0)]
            : undefined;
      statements = [];
      const started = performance.now();
      const dataset = await service.create({
        ...input,
        requestId: randomUUID(),
        rows,
        sourceAccounts: kind === 'owned' ? undefined : sources,
      });
      const elapsed = performance.now() - started,
        queries = statements.length;
      const counts = dataset.counts as { total: number };
      console.log(
        JSON.stringify({
          datasetBenchmark: true,
          hostHome: process.env.HOME,
          size,
          kind,
          run,
          queries,
          elapsedMs: elapsed,
          transactionElapsedMs: elapsed,
          selectedRows: counts.total,
          sourceAccounts: kind === 'owned' ? 0 : 10,
          graphNodes: kind === 'owned' ? 0 : 4 * size + 21,
          graphEdges: kind === 'owned' ? 0 : 6 * size + 200,
          batchSize: 1000,
        }),
      );
      expect(counts.total).toBe(size + (kind === 'mixed' ? 1 : 0));
      expect(queries).toBeLessThanOrEqual(
        kind === 'owned' ? 8 + Math.ceil(size / 1000) : 6000,
      );
      expect(elapsed).toBeLessThanOrEqual(kind === 'owned' ? 30000 : 60000);
      const entries = await prisma.contentLearningDatasetEntry.findMany({
        where: { datasetId: dataset.id },
        take: 1,
      });
      expect(entries[0].accountGroup).toMatch(/^[a-f0-9]{64}$/);
      await clearOutputs();
    }
    it.skipIf(!benchmark)(
      'measures 1k/10k/100k owned and consented three times after warmup plus mixed',
      async () => {
        for (const size of [1000, 10000, 100000]) {
          await seed(size);
          for (const kind of ['owned', 'consented'] as const)
            for (let run = 0; run < 4; run++) await measure(size, kind, run);
          if (size === 10000) await measure(size, 'mixed', 1);
        }
      },
      1200000,
    );
    it('serializes identical requests, rejects conflicts and rolls back entry/edge failures', async () => {
      await seed(2000);
      const request = {
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      };
      const [first, second] = await Promise.all([
        service.create(request),
        service.create(request),
      ]);
      expect(first.id).toBe(second.id);
      expect(await prisma.contentLearningDataset.count()).toBe(1);
      expect(
        await prisma.contentLearningDependency.count({
          where: { derivedKind: 'dataset' },
        }),
      ).toBe(2010);
      await expect(
        service.create({ ...request, cell: 'changed' }),
      ).rejects.toThrow('payload conflict');
      await clearOutputs();
      for (const table of [
        'content_learning_dataset_entries',
        'content_learning_dependencys',
      ]) {
        await pool.query(
          `CREATE FUNCTION fail_${table}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${table === 'content_learning_dependencys' ? 'NEW."derivedKind" = \'dataset\' AND NEW."sourceId" = \'reward-0001999\'' : 'NEW."sourceFingerprint" = \'reward-fingerprint-1999\''} THEN RAISE EXCEPTION 'injected late batch failure'; END IF; RETURN NEW; END $$`,
        );
        await pool.query(
          `CREATE TRIGGER fail_insert BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION fail_${table}()`,
        );
        const retry = { ...request, requestId: randomUUID() };
        await expect(service.create(retry)).rejects.toThrow(
          'injected late batch failure',
        );
        expect(await prisma.contentLearningDataset.count()).toBe(0);
        expect(await prisma.contentLearningDatasetEntry.count()).toBe(0);
        expect(await prisma.contentLearningOperation.count()).toBe(0);
        expect(
          await prisma.contentLearningDependency.count({
            where: { derivedKind: 'dataset' },
          }),
        ).toBe(0);
        await pool.query(`DROP TRIGGER fail_insert ON "${table}"`);
        await pool.query(`DROP FUNCTION fail_${table}()`);
        await service.create(retry);
        await clearOutputs();
      }
    }, 120000);
    it('decision FOR UPDATE conflicts with reward FK key-share and consent fence waits then invalidates', async () => {
      await seed(1000);
      const client = await pool.connect();
      await client.query('BEGIN');
      await client.query(
        `SELECT id FROM content_learning_decisions WHERE id='decision-0' FOR UPDATE`,
      );
      const entered = deferred();
      const pending = prisma.$transaction(async (tx) => {
        entered.resolve();
        await tx.contentLearningReward.create({
          data: {
            id: 'newer',
            organizationId: 'org-0',
            brandId: 'brand-0',
            credentialId: 'credential-0',
            decisionId: 'decision-0',
            checkpointId: 'checkpoint-0',
            baselineId: 'baseline-0',
            version: 2,
            rawComponents: {},
            boundedComponents: {},
            confidence: {},
            status: 'invalid_source',
            reasons: [],
            sourceFingerprint: 'newer',
          },
        });
      });
      await entered.promise;
      await expect
        .poll(async () =>
          Number(
            (
              await pool.query(
                `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%content_learning_rewards%'`,
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThan(0);
      await client.query('COMMIT');
      client.release();
      await pending;
      const dataset = await service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      });
      expect((dataset.counts as { total: number }).total).toBe(999);
      const held = deferred(),
        release = deferred();
      const snapshotFence = prisma.$transaction(async (tx) => {
        await learningFence(tx, 'shared');
        held.resolve();
        await release.promise;
      });
      await held.promise;
      const revocation = prisma.$transaction(async (tx) => {
        await learningFence(tx, 'exclusive');
        await tx.contentLearningConsent.update({
          where: { id: 'consent-0' },
          data: { revokedAt: new Date() },
        });
        await new LearningDependencyService(
          prisma as unknown as PrismaService,
        ).invalidate('consent', 'consent-0', tx, 'org-0');
      });
      await expect
        .poll(async () =>
          Number(
            (
              await pool.query(
                `SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted`,
              )
            ).rows[0].count,
          ),
        )
        .toBeGreaterThan(0);
      release.resolve();
      await snapshotFence;
      await revocation;
      expect(
        (
          await prisma.contentLearningDataset.findUniqueOrThrow({
            where: { id: dataset.id },
          })
        ).status,
      ).toBe('invalidated');
    }, 120000);
  },
);
