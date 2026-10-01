import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LearningDatasetGraph,
  LearningDatasetService,
} from '@api/collections/content-learning/services/learning-dataset.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertIsolatedDatabaseUrl } from '@api-test/../scripts/assert-isolated-db-url';
import { CredentialPlatform, Prisma, PrismaClient } from '@genfeedai/prisma';
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
    let pool: Pool,
      prisma: PrismaClient<{
        adapter: PrismaPg;
        log: [{ emit: 'event'; level: 'query' }];
      }>,
      service: LearningDatasetService;
    let statements: string[] = [];
    let transactionElapsedMs = 0;
    let graphBatches = 0,
      candidatePages = 0,
      decisionLockBatches = 0;
    let beforeDecisionLock: (() => Promise<void>) | undefined;
    let afterDatasetCreate: (() => Promise<void>) | undefined;
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
      const checks = readFileSync(
        new URL(
          '../../../../../../../packages/prisma/prisma/migrations/20260930180000_content_learning/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      for (const statement of checks.split(';')) {
        const clean = statement.replace(/^\s*--[^\n]*\n/gm, '').trim();
        const check = clean.match(
          /^ALTER TABLE "([^".]+)".*ADD CONSTRAINT.*CHECK/s,
        );
        if (check && tables.has(check[1])) await pool.query(clean);
      }
      prisma = new PrismaClient({
        adapter: new PrismaPg(pool, { schema }),
        log: [{ emit: 'event', level: 'query' }],
      });
      prisma.$on('query', (event) => {
        statements.push(event.query);
        if (
          event.query.includes('content_learning_rewards') &&
          event.query.includes('ORDER BY') &&
          event.query.includes('LIMIT')
        )
          candidatePages++;
      });
      const pinResolver = LearningDatasetGraph.prototype.pins;
      vi.spyOn(LearningDatasetGraph.prototype, 'pins').mockImplementation(
        function (
          this: LearningDatasetGraph,
          ...args: Parameters<LearningDatasetGraph['pins']>
        ) {
          graphBatches++;
          return pinResolver.apply(this, args);
        },
      );
      const instrumented = {
        $transaction: async (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: { maxWait: number; timeout: number },
        ) => {
          const started = performance.now();
          try {
            return await prisma.$transaction(async (tx) => {
              const proxy = new Proxy(tx, {
                get(target, property) {
                  if (property === '$queryRaw')
                    return async (
                      query: TemplateStringsArray | Prisma.Sql,
                      ...values: unknown[]
                    ) => {
                      if ('sql' in query && query.sql.includes('FOR UPDATE'))
                        decisionLockBatches++;
                      if (
                        'sql' in query &&
                        query.sql.includes('FOR UPDATE') &&
                        beforeDecisionLock
                      )
                        await beforeDecisionLock();
                      return target.$queryRaw(query, ...values);
                    };
                  if (property === 'contentLearningDataset')
                    return new Proxy(target.contentLearningDataset, {
                      get(delegate, method) {
                        if (method === 'create')
                          return async (
                            args: Prisma.ContentLearningDatasetCreateArgs,
                          ) => {
                            const result = await delegate.create(args);
                            if (afterDatasetCreate) await afterDatasetCreate();
                            return result;
                          };
                        return Reflect.get(delegate, method);
                      },
                    });
                  return Reflect.get(target, property);
                },
              });
              return callback(proxy);
            }, options);
          } finally {
            transactionElapsedMs = performance.now() - started;
          }
        },
      };
      service = new LearningDatasetService(
        instrumented as unknown as PrismaService,
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
        `INSERT INTO posts (id,description,"userId","organizationId","brandId","credentialId","updatedAt") SELECT 'post-'||i,'fixture','actor','org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),NOW() FROM generate_series(0,$1::int-1) i`,
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
      graphBatches = 0;
      candidatePages = 0;
      decisionLockBatches = 0;
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

          size,
          kind,
          run,
          queries,
          elapsedMs: elapsed,
          transactionElapsedMs,
          selectedRows: counts.total,
          sourceAccounts: kind === 'owned' ? 0 : 10,
          graphNodes: kind === 'owned' ? 0 : 4 * size + 21,
          graphEdges: kind === 'owned' ? 0 : 6 * size + 200,
          batchSize: 1000,
          graphBatches,
          candidatePages,
          decisionLockBatches,
          entryBatches: Math.ceil(counts.total / 1000),
          edgeBatches: kind === 'owned' ? 0 : Math.ceil((size + 10) / 1000),
        }),
      );
      expect(counts.total).toBe(size + (kind === 'mixed' ? 1 : 0));
      const secondaryGraphBatches = statements.filter(
        (query) =>
          query.includes('content_learning_accounts') &&
          query.includes(' IN ('),
      ).length;
      const queryBound =
        kind === 'owned'
          ? 8 + Math.ceil(size / 1000)
          : 12 +
            4 * 10 +
            3 * candidatePages +
            3 * (graphBatches + secondaryGraphBatches) +
            3 * decisionLockBatches +
            Math.ceil(counts.total / 1000) +
            Math.ceil((size + 10) / 1000);
      expect(queries).toBeLessThanOrEqual(queryBound);
      expect(queries).toBeLessThanOrEqual(
        kind === 'owned' ? 8 + Math.ceil(size / 1000) : 6000,
      );
      expect(elapsed).toBeLessThanOrEqual(kind === 'owned' ? 30000 : 60000);
      expect(transactionElapsedMs).toBeLessThanOrEqual(
        kind === 'owned' ? 30000 : 60000,
      );
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
    it('rejects source/consent identity changes and owned/consented fingerprint collisions', async () => {
      for (const change of [
        `UPDATE content_learning_accounts SET "sharingConsentVersion"=2 WHERE id='account-0'`,
        `UPDATE content_learning_consents SET "revokedAt"=NOW() WHERE id='consent-0'`,
        `UPDATE content_learning_consents SET granted=false WHERE id='consent-0'`,
        `UPDATE content_learning_consents SET "isDeleted"=true WHERE id='consent-0'`,
      ]) {
        await seed(1000);
        await pool.query(change);
        await expect(
          service.create({
            ...input,
            requestId: randomUUID(),
            sourceAccounts: sources,
          }),
        ).rejects.toThrow();
        expect(await prisma.contentLearningDataset.count()).toBe(0);
        await pool.query(
          `UPDATE content_learning_accounts SET "sharingConsentVersion"=1`,
        );
        await pool.query(
          `UPDATE content_learning_consents SET "revokedAt"=NULL, granted=true,"isDeleted"=false`,
        );
      }
      await seed(1000);
      await expect(
        service.create({
          ...input,
          requestId: randomUUID(),
          rows: [
            { ...numericRow(0), sourceFingerprint: 'reward-fingerprint-0' },
          ],
          sourceAccounts: sources,
        }),
      ).rejects.toThrow('Duplicate source fingerprint');
      expect(await prisma.contentLearningOperation.count()).toBe(0);
    }, 120000);
    it('excludes deleted, synthetic, wrong-account, pre-consent and invalid-pinned observations', async () => {
      for (const change of [
        `UPDATE content_learning_decisions SET "isDeleted"=true WHERE id='decision-0'`,
        `UPDATE content_learning_rewards SET "isDeleted"=true WHERE id='reward-0000000'`,
        `UPDATE content_learning_decisions SET synthetic=true WHERE id='decision-0'`,
        `UPDATE content_learning_decisions SET state='pending' WHERE id='decision-0'`,
        `UPDATE content_learning_decisions SET "credentialId"='credential-2' WHERE id='decision-0'`,
        `UPDATE content_learning_decisions SET "createdAt"=TIMESTAMP '2026-07-01' WHERE id='decision-0'`,
        `UPDATE content_learning_checkpoints SET revision=1 WHERE id='checkpoint-0'`,
        `UPDATE posts SET "isDeleted"=true WHERE id='post-0'`,
        `UPDATE content_learning_dependencys SET valid=false WHERE id='edge-0-checkpoint'`,
      ]) {
        await seed(1000);
        await pool.query(change);
        const dataset = await service.create({
          ...input,
          requestId: randomUUID(),
          sourceAccounts: sources,
        });
        expect((dataset.counts as { total: number }).total).toBe(
          change.includes('content_learning_checkpoints') ||
            change.startsWith('UPDATE posts')
            ? 900
            : 999,
        );
      }
    }, 120000);
    const replacementData = {
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
    };
    it('aborts a complete snapshot when a newer reward commits before final locks', async () => {
      await seed(1000);
      const held = deferred(),
        release = deferred();
      let once = false;
      beforeDecisionLock = async () => {
        if (!once) {
          once = true;
          held.resolve();
          await release.promise;
        }
      };
      const request = {
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      };
      const snapshot = service.create(request);
      try {
        await Promise.race([
          held.promise,
          snapshot.then(() => {
            throw new Error('Snapshot finished before barrier');
          }),
        ]);
        await prisma.contentLearningReward.create({ data: replacementData });
        release.resolve();
        await expect(snapshot).rejects.toThrow('Source invalidated');
        expect(await prisma.contentLearningDataset.count()).toBe(0);
        expect(await prisma.contentLearningDatasetEntry.count()).toBe(0);
        expect(await prisma.contentLearningOperation.count()).toBe(0);
        expect(
          await prisma.contentLearningDependency.count({
            where: { derivedKind: 'dataset' },
          }),
        ).toBe(0);
      } finally {
        beforeDecisionLock = undefined;
        release.resolve();
        await snapshot.catch(() => undefined);
      }
    }, 120000);
    it('blocks a newer reward behind actual service locks then invalidates the committed dataset and preserves retry', async () => {
      await seed(1000);
      const held = deferred(),
        release = deferred();
      afterDatasetCreate = async () => {
        held.resolve();
        await release.promise;
      };
      const request = {
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      };
      const snapshot = service.create(request);
      let replacement: Promise<unknown> | undefined;
      try {
        await Promise.race([
          held.promise,
          snapshot.then(() => {
            throw new Error('Snapshot finished before barrier');
          }),
        ]);
        replacement = prisma.$transaction(async (tx) => {
          await tx.contentLearningReward.create({ data: replacementData });
          await new LearningDependencyService(
            prisma as unknown as PrismaService,
          ).invalidate('reward', 'reward-0000000', tx, 'org-0');
        });
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
        release.resolve();
        const dataset = await snapshot;
        await replacement;
        afterDatasetCreate = undefined;
        const retry = await service.create(request);
        expect(retry.id).toBe(dataset.id);
        expect(retry.manifestHash).toBe(dataset.manifestHash);
        expect(retry.status).toBe('invalidated');
      } finally {
        afterDatasetCreate = undefined;
        release.resolve();
        await snapshot.catch(() => undefined);
        await replacement?.catch(() => undefined);
      }
    }, 120000);
    it('exclusive consent revocation waits for an actual snapshot then follows the deduplicated edge', async () => {
      await seed(1000);
      const held = deferred(),
        release = deferred();
      afterDatasetCreate = async () => {
        held.resolve();
        await release.promise;
      };
      const snapshot = service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      });
      let revoke: Promise<unknown> | undefined;
      try {
        await Promise.race([
          held.promise,
          snapshot.then(() => {
            throw new Error('Snapshot finished before barrier');
          }),
        ]);
        revoke = prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(5728,1)::text`;
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
        const dataset = await snapshot;
        await revoke;
        expect(
          (
            await prisma.contentLearningDataset.findUniqueOrThrow({
              where: { id: dataset.id },
            })
          ).status,
        ).toBe('invalidated');
      } finally {
        afterDatasetCreate = undefined;
        release.resolve();
        await snapshot.catch(() => undefined);
        await revoke?.catch(() => undefined);
        await prisma.contentLearningConsent.update({
          where: { id: 'consent-0' },
          data: { revokedAt: null },
        });
      }
    }, 120000);
    it('pages past ineligible candidates and excludes latest invalid or post-cutoff versions', async () => {
      await seed(12000);
      await prisma.contentLearningReward.updateMany({
        where: { credentialId: 'credential-0', id: { lte: 'reward-0009999' } },
        data: { composite: null },
      });
      const result = await service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: [sources[0]],
      });
      expect((result.counts as { total: number }).total).toBe(200);
      await clearOutputs();
      await seed(1000);
      await prisma.contentLearningReward.create({
        data: {
          ...replacementData,
          createdAt: new Date('2026-10-01'),
          status: 'valid',
          composite: 0.5,
        },
      });
      const latest = await service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      });
      expect((latest.counts as { total: number }).total).toBe(999);
    }, 120000);
  },
);
