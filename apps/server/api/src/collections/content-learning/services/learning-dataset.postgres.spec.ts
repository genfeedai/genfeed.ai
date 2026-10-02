import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statfsSync } from 'node:fs';
import { PerformanceObserver } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { LearningDatasetService } from '@api/collections/content-learning/services/learning-dataset.service';
import { LearningDatasetGraph } from '@api/collections/content-learning/services/learning-dataset-graph.service';
import {
  createLearningDatasetPublicationEvidence,
  createLearningDatasetPublications,
  type DatasetPublicationPhase,
  type DatasetPublicationProgress,
  withdrawLearningDatasetPublication,
} from '@api/collections/content-learning/services/learning-dataset-publication.fixture';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import {
  learningPublicationDependencyRefsV1,
  resolveLearningPublicationSourceV1,
} from '@api/collections/content-learning/services/learning-publication-source.helper';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  assertControllerOwnedMigrationConnection,
  assertControllerOwnedMigrationInventory,
  readControllerOwnedMigrationDatabaseUrl,
} from '@api-test/helpers/controller-owned-migration-database';
import { formatMigrationDeployDiagnostic } from '@api-test/helpers/migration-deploy-diagnostics';
import { CredentialPlatform, Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

const explicitUrl = process.env.LEARNING_DATASET_TEST_DATABASE_URL;
const benchmark = process.env.LEARNING_DATASET_BENCHMARK === '1';
const diagnostic = process.env.LEARNING_DATASET_PROFILE === '1';
if (benchmark && diagnostic)
  throw new Error('Dataset benchmark and profile modes are mutually exclusive');
const databaseRole = diagnostic
  ? 'dataset-profile'
  : benchmark
    ? 'dataset-matrix'
    : 'dataset-correctness';
type TimingMetric = {
  calls: number;
  wallMs: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
};
type QueryMetric = {
  count: number;
  durationMs: number;
  maxDurationMs: number;
  samples: string[];
};
const memoryBoundary = () => {
  const { heapUsed, heapTotal, external, arrayBuffers, rss } =
    process.memoryUsage();
  return { heapUsed, heapTotal, external, arrayBuffers, rss };
};
function queryCategory(query: string) {
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(query)) return 'transaction';
  if (query.includes('FOR UPDATE')) return 'decision-lock';
  if (query.includes('pg_advisory')) return 'fence';
  if (query.includes('content_learning_dataset_entries')) return 'entries';
  if (query.includes('content_learning_dependencys'))
    return query.startsWith('INSERT') ? 'dependency-write' : 'graph-edges';
  if (query.includes('content_learning_rewards'))
    return query.includes('GROUP BY')
      ? 'latest-rewards'
      : query.includes('ORDER BY')
        ? 'candidate-rewards'
        : 'reward-pins';
  if (query.includes('content_learning_decisions')) return 'decisions';
  if (query.includes('content_learning_accounts')) return 'accounts';
  if (query.includes('content_learning_consents')) return 'consents';
  if (query.includes('content_learning_datasets')) return 'dataset';
  if (query.includes('content_learning_operations')) return 'operation';
  return 'other-pins';
}
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
      prisma: PrismaClient<'query'>,
      service: LearningDatasetService;
    let queryCount = 0;
    let diagnosticsOwned = false;
    let diagnosticBytes = 0;
    let diagnosticRecords = 0;
    let caseOrdinal = 0;
    let seedOrdinal = 0;
    const diagnosticTimers = new Set<ReturnType<typeof setInterval>>();
    type SeedCounter = {
      started: number;
      complete: number;
      failed: number;
      elapsedMs: number;
    };
    type SeedEvent =
      | 'bootstrap-start'
      | 'bootstrap-end'
      | 'case-start'
      | 'case-end'
      | 'seed-start'
      | 'seed-end'
      | 'seed-failed'
      | 'heartbeat'
      | 'publication-end'
      | 'evidence-end'
      | 'rows-end';
    function seedDiagnostic(
      event: SeedEvent,
      seed = 0,
      size = 0,
      started = performance.now(),
      counters?: Partial<Record<DatasetPublicationPhase, SeedCounter>>,
      ownerCase = caseOrdinal,
    ) {
      if (
        !diagnosticsOwned ||
        process.env.LEARNING_DATASET_SEED_DIAGNOSTICS !== '1' ||
        diagnosticRecords >= 1024
      )
        return;
      const line = `DATASET_SEED_PHASE ${JSON.stringify({
        version: 1,
        role: databaseRole,
        event,
        caseOrdinal: ownerCase,
        seedOrdinal: seed,
        requestedSize: size,
        elapsedMs: Math.max(0, performance.now() - started),
        queryCount,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
        counters: counters ?? {},
      })}\n`;
      const bytes = Buffer.byteLength(line);
      if (diagnosticBytes + bytes > 256 * 1024) return;
      diagnosticRecords++;
      diagnosticBytes += bytes;
      process.stderr.write(line);
    }
    beforeEach(() => {
      caseOrdinal++;
      seedDiagnostic('case-start');
    });
    afterEach(() => {
      seedDiagnostic('case-end');
    });
    let secondaryGraphBatches = 0;
    let queryObserverOverheadMs = 0;
    let phaseInstrumentationOverheadMs = 0;
    let graphInstrumentationOverheadMs = 0;
    let gcObserverOverheadMs = 0;
    let queryMetrics = new Map<string, QueryMetric>();
    let phaseMetrics = new Map<string, TimingMetric>();
    let phaseBoundaries: {
      phase: string;
      boundary: string;
      memory: ReturnType<typeof memoryBoundary>;
    }[] = [];
    let nestedGraphMetrics = new Map<string, TimingMetric>();
    let profileActive = false;
    let gcCount = 0,
      gcDurationMs = 0;
    let maxBindParameters = 0;
    let graphNodesMaxPass = 0,
      graphEdgesMaxPass = 0,
      graphNodesAcrossPasses = 0,
      graphEdgesAcrossPasses = 0;
    let graphObservations = new WeakMap<
      LearningDatasetGraph,
      { nodes: number; edges: number }
    >();
    let transactionElapsedMs = 0;
    let graphBatches = 0,
      candidatePages = 0,
      decisionLockBatches = 0;
    let beforeDecisionLock: (() => Promise<void>) | undefined;
    let afterDatasetCreate: (() => Promise<void>) | undefined;
    const schema = 'public';
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
    function recordTiming(
      metrics: Map<string, TimingMetric>,
      name: string,
      wallMs: number,
      cpu: ReturnType<typeof process.cpuUsage>,
    ) {
      const metric = metrics.get(name) ?? {
        calls: 0,
        wallMs: 0,
        cpuUserMicros: 0,
        cpuSystemMicros: 0,
      };
      metric.calls++;
      metric.wallMs += wallMs;
      metric.cpuUserMicros += cpu.user;
      metric.cpuSystemMicros += cpu.system;
      metrics.set(name, metric);
    }
    function instrumentGraph() {
      const prototype = LearningDatasetGraph.prototype;
      const pins = prototype.pins,
        load = prototype.load;
      prototype.pins = async function (...args) {
        const overheadStarted = performance.now();
        graphBatches++;
        const cpu = process.cpuUsage(),
          started = performance.now();
        graphInstrumentationOverheadMs += started - overheadStarted;
        try {
          return await Reflect.apply(pins, this, args);
        } finally {
          const overheadStarted = performance.now();
          if (profileActive)
            recordTiming(
              nestedGraphMetrics,
              'pins',
              overheadStarted - started,
              process.cpuUsage(cpu),
            );
          graphInstrumentationOverheadMs += performance.now() - overheadStarted;
        }
      };
      prototype.load = async function (...args) {
        const overheadStarted = performance.now();
        const cpu = process.cpuUsage(),
          started = performance.now();
        graphInstrumentationOverheadMs += started - overheadStarted;
        try {
          await Reflect.apply(load, this, args);
        } finally {
          const overheadStarted = performance.now();
          if (profileActive)
            recordTiming(
              nestedGraphMetrics,
              'load',
              overheadStarted - started,
              process.cpuUsage(cpu),
            );
          const current = this.metrics,
            previous = graphObservations.get(this) ?? { nodes: 0, edges: 0 };
          graphNodesAcrossPasses += current.nodes - previous.nodes;
          graphEdgesAcrossPasses += current.edges - previous.edges;
          graphNodesMaxPass = Math.max(graphNodesMaxPass, current.nodes);
          graphEdgesMaxPass = Math.max(graphEdgesMaxPass, current.edges);
          graphObservations.set(this, current);
          graphInstrumentationOverheadMs += performance.now() - overheadStarted;
        }
      };
      return () => {
        prototype.pins = pins;
        prototype.load = load;
      };
    }
    function instrumentPhases() {
      const prototype = LearningDatasetService.prototype;
      const restored: { name: string; descriptor: PropertyDescriptor }[] = [];
      for (const name of [
        'extractSources',
        'prepareManifest',
        'lockSelectedDecisions',
        'revalidateSources',
        'persistEntries',
        'persistDependencies',
      ]) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
        if (!descriptor?.configurable || !descriptor.writable)
          throw new Error(`Cannot profile phase ${name}`);
        const original: unknown = descriptor.value;
        if (typeof original !== 'function')
          throw new Error(`Phase ${name} is not callable`);
        restored.push({ name, descriptor });
      }
      for (const { name, descriptor } of restored) {
        const original: unknown = descriptor.value;
        if (typeof original !== 'function')
          throw new Error(`Validated phase ${name} is not callable`);
        Object.defineProperty(prototype, name, {
          ...descriptor,
          value: function (this: unknown, ...args: unknown[]) {
            const overheadStarted = performance.now();
            phaseBoundaries.push({
              phase: name,
              boundary: 'start',
              memory: memoryBoundary(),
            });
            const cpu = process.cpuUsage(),
              started = performance.now();
            phaseInstrumentationOverheadMs += started - overheadStarted;
            const finish = () => {
              const overheadStarted = performance.now();
              recordTiming(
                phaseMetrics,
                name,
                overheadStarted - started,
                process.cpuUsage(cpu),
              );
              phaseBoundaries.push({
                phase: name,
                boundary: 'end',
                memory: memoryBoundary(),
              });
              phaseInstrumentationOverheadMs +=
                performance.now() - overheadStarted;
            };
            let result: unknown;
            try {
              result = Reflect.apply(original, this, args);
            } catch (error) {
              finish();
              throw error;
            }
            if (result instanceof Promise) return result.finally(finish);
            finish();
            return result;
          },
        });
      }
      return () => {
        for (const { name, descriptor } of restored)
          Object.defineProperty(prototype, name, descriptor);
      };
    }
    beforeAll(async () => {
      const url = readControllerOwnedMigrationDatabaseUrl(
        databaseRole,
        explicitUrl,
      );
      pool = new Pool({
        connectionString: url,
        max: 5,
        options: '-c search_path=public',
      });
      await assertControllerOwnedMigrationConnection(pool, databaseRole, true);
      diagnosticsOwned = true;
      seedDiagnostic('bootstrap-start');
      const migrationDirectory = new URL(
        '../../../../../../../packages/prisma/prisma/migrations/',
        import.meta.url,
      );
      const migrationNames = readdirSync(migrationDirectory, {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const expected = migrationNames.map((migration_name) => ({
        migration_name,
        checksum: createHash('sha256')
          .update(
            readFileSync(
              new URL(`${migration_name}/migration.sql`, migrationDirectory),
            ),
          )
          .digest('hex'),
      }));
      try {
        execFileSync('bun', ['x', 'prisma', 'migrate', 'deploy'], {
          cwd: fileURLToPath(
            new URL('../../../../../../../packages/prisma', import.meta.url),
          ),
          env: { ...process.env, DATABASE_URL: url },
          timeout: 120000,
          maxBuffer: 8 * 1024 * 1024,
          stdio: 'pipe',
        });
      } catch (error) {
        console.error(formatMigrationDeployDiagnostic(error, url));
        throw new Error('Owned dataset migration deployment failed');
      }
      const connections = await Promise.all(
        Array.from({ length: 5 }, () => pool.connect()),
      );
      try {
        for (const connection of connections)
          await assertControllerOwnedMigrationConnection(
            connection,
            databaseRole,
          );
      } finally {
        for (const connection of connections) connection.release();
      }
      const applied = await pool.query(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
      );
      assertControllerOwnedMigrationInventory(applied.rows, expected);
      prisma = new PrismaClient({
        adapter: new PrismaPg(pool, { schema }),
        log: [{ emit: 'event', level: 'query' }],
      });
      prisma.$on('query', (event) => {
        const observedAt = performance.now();
        queryCount++;
        const parameters: unknown = JSON.parse(event.params);
        if (!Array.isArray(parameters))
          throw new Error('Prisma query parameters must be a JSON array');
        maxBindParameters = Math.max(maxBindParameters, parameters.length);
        if (
          event.query.includes('content_learning_rewards') &&
          event.query.includes('ORDER BY') &&
          event.query.includes('LIMIT')
        )
          candidatePages++;
        if (
          event.query.includes('content_learning_accounts') &&
          event.query.includes(' IN (')
        )
          secondaryGraphBatches++;
        if (profileActive) {
          const category = queryCategory(event.query);
          const aggregate = queryMetrics.get(category) ?? {
            count: 0,
            durationMs: 0,
            maxDurationMs: 0,
            samples: [],
          };
          aggregate.count++;
          aggregate.durationMs += event.duration;
          aggregate.maxDurationMs = Math.max(
            aggregate.maxDurationMs,
            event.duration,
          );
          if (aggregate.samples.length < 2)
            aggregate.samples.push(event.query.slice(0, 240));
          queryMetrics.set(category, aggregate);
        }
        queryObserverOverheadMs += performance.now() - observedAt;
      });
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
      expect(
        (
          await prisma.$queryRaw<
            Array<{ schema: string }>
          >`SELECT current_schema() AS schema`
        )[0].schema,
      ).toBe(schema);
      await prisma.role.upsert({
        where: { key: 'owner' },
        create: { id: 'fixture-owner', key: 'owner', label: 'Owner' },
        update: {},
      });
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
      for (let i = 0; i < 2; i++) {
        const role = await prisma.role.findUniqueOrThrow({
          where: { key: 'owner' },
        });
        await prisma.member.create({
          data: {
            organizationId: `org-${i}`,
            userId: 'actor',
            roleId: role.id,
            currentBrandId: `brand-${i}`,
            isActive: true,
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
            isConnected: true,
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
      seedDiagnostic('bootstrap-end');
    }, 120000);
    afterAll(async () => {
      for (const timer of diagnosticTimers) clearInterval(timer);
      diagnosticTimers.clear();
      const failures: unknown[] = [];
      try {
        await prisma?.$disconnect();
      } catch (error) {
        failures.push(error);
      }
      try {
        await pool?.end();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length)
        throw new AggregateError(
          failures,
          'Owned dataset connection cleanup failed',
        );
    });
    async function clearOutputs() {
      await pool.query(
        'DELETE FROM content_learning_dependencys WHERE "derivedKind" = \'dataset\'',
      );
      await prisma.contentLearningOperation.deleteMany();
      await prisma.contentLearningDatasetEntry.deleteMany();
      await prisma.contentLearningDataset.deleteMany();
    }
    function assertBenchmarkDiskSpace() {
      if (!benchmark && !diagnostic) return;
      const { bavail, bsize } = statfsSync(process.cwd());
      if (bavail * bsize < 10 * 1024 ** 3)
        throw new Error(
          'Dataset benchmark stopped: fewer than 10 GiB of free disk space',
        );
    }
    let publications: Awaited<
      ReturnType<typeof createLearningDatasetPublications>
    > = [];
    let checkpointIds: string[] = [];
    let baselineIds: string[] = [];
    async function seed(size: number) {
      const ordinal = ++seedOrdinal;
      const ownerCase = caseOrdinal;
      const started = performance.now();
      const counters: Partial<Record<DatasetPublicationPhase, SeedCounter>> =
        {};
      const progress: DatasetPublicationProgress | undefined =
        diagnosticsOwned &&
        process.env.LEARNING_DATASET_SEED_DIAGNOSTICS === '1'
          ? (phase, event, elapsedMs) => {
              const counter = counters[phase] ?? {
                started: 0,
                complete: 0,
                failed: 0,
                elapsedMs: 0,
              };
              counters[phase] = counter;
              if (event === 'start') counter.started++;
              else {
                counter[event]++;
                counter.elapsedMs += elapsedMs;
              }
            }
          : undefined;
      const emit = (event: SeedEvent) =>
        seedDiagnostic(event, ordinal, size, started, counters, ownerCase);
      emit('seed-start');
      const timer = progress
        ? setInterval(() => emit('heartbeat'), 10000)
        : undefined;
      if (timer) {
        timer.unref();
        diagnosticTimers.add(timer);
      }
      try {
        await seedRows(size, progress, emit);
        emit('seed-end');
      } catch (error) {
        emit('seed-failed');
        throw error;
      } finally {
        if (timer) {
          clearInterval(timer);
          diagnosticTimers.delete(timer);
        }
      }
    }
    async function seedRows(
      size: number,
      progress: DatasetPublicationProgress | undefined,
      emit: (event: SeedEvent) => void,
    ) {
      assertBenchmarkDiskSpace();
      await clearOutputs();
      for (const table of [
        'content_learning_dependencys',
        'content_learning_rewards',
        'content_learning_decisions',
        'content_learning_baselines',
        'content_learning_checkpoints',
        'content_learning_scope_states',
      ])
        await pool.query(`DELETE FROM "${table}"`);
      await prisma.post.updateMany({
        data: { publishApprovalId: null, reviewVersionPinId: null },
      });
      await prisma.postPublishFinalization.deleteMany();
      await prisma.publishApproval.deleteMany();
      await prisma.post.deleteMany();
      publications = await createLearningDatasetPublications(
        prisma,
        size,
        randomUUID(),
        progress,
      );
      emit('publication-end');
      const evidence = await createLearningDatasetPublicationEvidence(
        prisma,
        publications,
        progress,
      );
      emit('evidence-end');
      checkpointIds = publications.map(
        (publication, index) =>
          evidence.checkpoints[index]?.id ?? `checkpoint-${publication.index}`,
      );
      for (let start = 200; start < size; start += 1000) {
        const end = Math.min(size, start + 1000);
        await prisma.contentLearningCheckpoint.createMany({
          data: publications.slice(start, end).map(({ source, index }) => ({
            id: checkpointIds[index],
            organizationId: source.organizationId,
            brandId: source.brandId,
            credentialId: source.credentialId,
            postId: source.postId,
            sourceAttemptId: `attempt-${index}`,
            dueAt: new Date('2026-09-03T00:00:00.000Z'),
            requestStartedAt: new Date('2026-09-03T00:00:00.000Z'),
            receivedAt: new Date('2026-09-03T00:01:00.000Z'),
            publishedAt: new Date(source.publishedAt),
            measurement: {
              collection: {
                version: 1,
                outcome: 'observed',
                reasonCode: null,
              },
              measurement: { exposure: 1000, weightedActions: 10 },
            },
            format: 'text',
            organicProvenance: {
              isPaid: false,
              isPinned: false,
              source: 'provider',
            },
            sourceFingerprint: `checkpoint-fingerprint-${index}`,
            validity: 'valid',
          })),
        });
        const edges = publications
          .slice(start, end)
          .flatMap(({ refs, source, index }) =>
            refs.map((ref) => ({
              sourceKind: ref.kind,
              sourceId: ref.id,
              sourceVersion: ref.version,
              sourceOrganizationId: ref.organizationId,
              derivedKind: 'checkpoint',
              derivedId: checkpointIds[index],
              derivedOrganizationId: source.organizationId,
            })),
          );
        for (let offset = 0; offset < edges.length; offset += 1000)
          await prisma.contentLearningDependency.createMany({
            data: edges.slice(offset, offset + 1000),
          });
      }
      baselineIds = evidence.baselines.map((row) => row.id);
      const baselineVersions = evidence.baselines.map((row) => row.fingerprint);
      for (let start = 0; start < size; start += 1000) {
        const end = Math.min(size, start + 1000);
        await pool.query(
          `INSERT INTO content_learning_decisions (id,"organizationId","brandId","credentialId","requestKey","destinationKey","candidateIndex","payloadHash","scopeKey",epoch,"accountRevision",mode,"contextVector","contextSnapshot","eligibleArmIds",probabilities,"selectedArmId","selectedProbability",assignment,"assignmentProbability","executionProbability","configVersion","baselineId",state,"createdAt","updatedAt") SELECT 'decision-'||i,'org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),'request-'||i,'destination',0,'payload-'||i,'scope-'||(i%10),0,0,'shadow',ARRAY[1,0,1,0,1,0,1,0,1]::float8[],'{}',ARRAY['baseline-v1'],'{"baseline-v1":1,"question-example-v1":0,"proof-steps-v1":0}','baseline-v1',1,'fixture',1,1,'ridge-epsilon-v1',($3::text[])[(i%10)+1],'published',TIMESTAMP '2026-09-01'+(i%100)*INTERVAL '1 second',NOW() FROM generate_series($2::int,$1::int-1) i`,
          [end, start, baselineIds],
        );
        await pool.query(
          `INSERT INTO content_learning_rewards (id,"organizationId","brandId","credentialId","decisionId",version,"checkpointId","baselineId","rawComponents","boundedComponents",composite,confidence,status,reasons,"sourceFingerprint","createdAt","updatedAt") SELECT 'reward-'||lpad(i::text,7,'0'),'org-'||(i%10%2),'brand-'||(i%10%2),'credential-'||(i%10),'decision-'||i,1,($4::text[])[i-$2+1],($3::text[])[(i%10)+1],'{}','{}',0.5,'{}','valid',ARRAY[]::text[],'reward-fingerprint-'||i,TIMESTAMP '2026-09-03',NOW() FROM generate_series($2::int,$1::int-1) i`,
          [end, start, baselineIds, checkpointIds.slice(start, end)],
        );
        const edges = publications
          .slice(start, end)
          .flatMap(({ source, index }) =>
            [
              {
                sourceKind: 'checkpoint',
                sourceId: checkpointIds[index],
                sourceVersion: '0',
              },
              {
                sourceKind: 'baseline',
                sourceId: baselineIds[index % 10],
                sourceVersion: baselineVersions[index % 10],
              },
              {
                sourceKind: 'decision',
                sourceId: `decision-${index}`,
                sourceVersion: `payload-${index}`,
              },
            ].map((ref) => ({
              ...ref,
              id: `edge-${index}-${ref.sourceKind}`,
              sourceOrganizationId: source.organizationId,
              derivedKind: 'reward',
              derivedId: `reward-${String(index).padStart(7, '0')}`,
              derivedOrganizationId: source.organizationId,
            })),
          );
        for (let offset = 0; offset < edges.length; offset += 1000)
          await prisma.contentLearningDependency.createMany({
            data: edges.slice(offset, offset + 1000),
          });
        await prisma.contentLearningDependency.createMany({
          data: publications.slice(start, end).map(({ source, index }) => ({
            sourceKind: 'config',
            sourceId: 'numeric-nine-v1',
            sourceVersion: 'numeric-nine-v1',
            sourceOrganizationId: null,
            derivedKind: 'decision',
            derivedId: `decision-${index}`,
            derivedOrganizationId: source.organizationId,
          })),
        });
      }
      emit('rows-end');
      await pool.query('ANALYZE');
    }
    async function measure(
      size: number,
      kind: 'owned' | 'consented' | 'mixed',
      run: number,
      profile = false,
    ) {
      assertBenchmarkDiskSpace();
      const rows =
        kind === 'owned'
          ? Array.from({ length: size }, (_, i) => numericRow(i))
          : kind === 'mixed'
            ? [numericRow(0)]
            : undefined;
      graphObservations = new WeakMap<
        LearningDatasetGraph,
        { nodes: number; edges: number }
      >();
      graphNodesMaxPass = 0;
      graphEdgesMaxPass = 0;
      graphNodesAcrossPasses = 0;
      graphEdgesAcrossPasses = 0;
      maxBindParameters = 0;
      queryCount = 0;
      secondaryGraphBatches = 0;
      queryObserverOverheadMs = 0;
      phaseInstrumentationOverheadMs = 0;
      graphInstrumentationOverheadMs = 0;
      gcObserverOverheadMs = 0;
      queryMetrics = new Map();
      phaseMetrics = new Map();
      nestedGraphMetrics = new Map();
      phaseBoundaries = [];
      gcCount = 0;
      gcDurationMs = 0;
      profileActive = profile;
      graphBatches = 0;
      candidatePages = 0;
      decisionLockBatches = 0;
      const graphSetupStarted = performance.now();
      const restoreGraph = instrumentGraph();
      graphInstrumentationOverheadMs += performance.now() - graphSetupStarted;
      let restorePhases: () => void = () => {};
      const observer = new PerformanceObserver((list) => {
        const overheadStarted = performance.now();
        for (const entry of list.getEntries()) {
          gcCount++;
          gcDurationMs += entry.duration;
        }
        gcObserverOverheadMs += performance.now() - overheadStarted;
      });
      const memoryBefore = memoryBoundary();
      const cpuBefore = process.cpuUsage();
      const started = performance.now();
      let dataset: Awaited<ReturnType<LearningDatasetService['create']>>;
      let elapsed = 0;
      let cpu = process.cpuUsage(cpuBefore);
      try {
        const overheadStarted = performance.now();
        restorePhases = profile ? instrumentPhases() : () => {};
        phaseInstrumentationOverheadMs += performance.now() - overheadStarted;
        const gcStarted = performance.now();
        if (profile) observer.observe({ entryTypes: ['gc'] });
        gcObserverOverheadMs += performance.now() - gcStarted;
        dataset = await service.create({
          ...input,
          requestId: randomUUID(),
          rows,
          sourceAccounts: kind === 'owned' ? undefined : sources,
        });
        elapsed = performance.now() - started;
        cpu = process.cpuUsage(cpuBefore);
      } finally {
        let overheadStarted = performance.now();
        restoreGraph();
        graphInstrumentationOverheadMs += performance.now() - overheadStarted;
        overheadStarted = performance.now();
        restorePhases();
        phaseInstrumentationOverheadMs += performance.now() - overheadStarted;
        overheadStarted = performance.now();
        for (const entry of observer.takeRecords()) {
          gcCount++;
          gcDurationMs += entry.duration;
        }
        observer.disconnect();
        gcObserverOverheadMs += performance.now() - overheadStarted;
        profileActive = false;
      }
      const queries = queryCount;
      const counts = dataset.counts as { total: number };
      const phaseWallMs = [...phaseMetrics.values()].reduce(
        (total, phase) => total + phase.wallMs,
        0,
      );
      console.log(
        JSON.stringify({
          datasetBenchmark: !profile,
          samplePurpose: profile
            ? 'diagnostic-only-not-matrix-acceptance'
            : run === 0
              ? 'matrix-warmup'
              : 'matrix-measurement',
          ...(profile
            ? {
                datasetDiagnostic: true,
                cpu,
                memoryBefore,
                memoryAfter: memoryBoundary(),
                phases: Object.fromEntries(phaseMetrics),
                phaseWallMs,
                remainingWallMs: elapsed - phaseWallMs,
                timingAccounting:
                  'Service phases are sequential; graph and SQL timings are nested diagnostics and are not added to phase totals.',
                phaseBoundaries,
                nestedGraph: Object.fromEntries(nestedGraphMetrics),
                gc: { count: gcCount, durationMs: gcDurationMs },
                sql: Object.fromEntries(queryMetrics),
                observerOverheadMs:
                  queryObserverOverheadMs +
                  phaseInstrumentationOverheadMs +
                  graphInstrumentationOverheadMs +
                  gcObserverOverheadMs,
                overheadComponents: {
                  queryObserverOverheadMs,
                  phaseInstrumentationOverheadMs,
                  graphInstrumentationOverheadMs,
                  gcObserverOverheadMs,
                },
                overheadAccounting:
                  'Bookkeeping overhead is reported separately and never subtracted from acceptance elapsed; memory snapshots are boundaries, not peaks; process rss is distinct from runner group rss.',
              }
            : {}),

          size,
          kind,
          run,
          queries,
          elapsedMs: elapsed,
          transactionElapsedMs,
          selectedRows: counts.total,
          sourceAccounts: kind === 'owned' ? 0 : 10,
          graphNodesMaxPass,
          graphEdgesMaxPass,
          graphNodesAcrossPasses,
          graphEdgesAcrossPasses,
          maxBindParameters,
          batchSize: 1000,
          graphBatches,
          candidatePages,
          decisionLockBatches,
          secondaryGraphBatches,
          entryBatches: Math.ceil(counts.total / 1000),
          edgeBatches: kind === 'owned' ? 0 : Math.ceil((size + 10) / 1000),
        }),
      );
      expect(counts.total).toBe(size + (kind === 'mixed' ? 1 : 0));
      expect(maxBindParameters).toBeLessThanOrEqual(32767);
      expect(graphNodesMaxPass).toBe(kind === 'owned' ? 0 : 7 * size + 36);
      expect(graphEdgesMaxPass).toBe(kind === 'owned' ? 0 : 12 * size + 210);
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
      expect(
        await prisma.contentLearningDatasetEntry.count({
          where: { datasetId: dataset.id },
        }),
      ).toBe(counts.total);
      expect(
        await prisma.contentLearningDependency.count({
          where: { derivedKind: 'dataset', derivedId: dataset.id },
        }),
      ).toBe(kind === 'owned' ? 0 : size + 10);
      await clearOutputs();
      assertBenchmarkDiskSpace();
    }
    it('creates genuine publication/capture/materializer lineage and exact scalar/bulk dataset pins', async () => {
      await seed(1000);
      const retainedPublication = publications[0];
      const retainedPin = await prisma.contentVersionPin.findUniqueOrThrow({
        where: { id: retainedPublication.source.versionPinId },
      });
      await seed(1000);
      expect(
        await prisma.contentVersionPin.findUniqueOrThrow({
          where: { id: retainedPin.id },
        }),
      ).toEqual(retainedPin);
      expect(publications[0].source.postId).not.toBe(
        retainedPublication.source.postId,
      );
      expect(publications[0].source.versionPinId).not.toBe(retainedPin.id);
      const publication = publications[0];
      const current = await resolveLearningPublicationSourceV1(
        prisma,
        'org-0',
        publication.source.postId,
      );
      expect(current).toEqual(publication.source);
      if (!current) throw new Error('Missing production current publication');
      expect(learningPublicationDependencyRefsV1(current)).toEqual(
        publication.refs,
      );
      const edges = await prisma.contentLearningDependency.findMany({
        where: {
          derivedKind: 'checkpoint',
          derivedId: checkpointIds[0],
          derivedOrganizationId: 'org-0',
          isDeleted: false,
        },
      });
      expect(
        edges
          .map((edge) => ({
            kind: edge.sourceKind,
            id: edge.sourceId,
            version: edge.sourceVersion,
            organizationId: edge.sourceOrganizationId,
          }))
          .sort((a, b) => a.kind.localeCompare(b.kind)),
      ).toEqual(
        [...publication.refs].sort((a, b) => a.kind.localeCompare(b.kind)),
      );
      const checkpoint =
        await prisma.contentLearningCheckpoint.findUniqueOrThrow({
          where: { id: checkpointIds[0] },
        });
      expect(checkpoint.validity).toBe('valid');
      expect(checkpoint.dueAt.getTime()).toBe(
        checkpoint.publishedAt.getTime() + 48 * 3600000,
      );
      const baseline = await prisma.contentLearningBaseline.findUniqueOrThrow({
        where: { id: baselineIds[0] },
      });
      expect(baseline.count).toBe(20);
      expect(baseline.contributorCheckpointIds).toContain(checkpoint.id);
      const graph = new LearningDatasetGraph(prisma);
      const scalar = new LearningDependencyService(
        prisma as unknown as PrismaService,
      );
      for (const ref of publication.refs) {
        expect(
          (
            await graph.pins(
              ref.kind,
              [ref.id],
              ref.organizationId ?? current.organizationId,
            )
          ).get(ref.id),
        ).toBe(ref.version);
        expect(
          await scalar.resolve(ref.kind, ref.id, ref.organizationId, prisma),
        ).toEqual(ref);
      }
      const dataset = await service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      });
      expect((dataset.counts as { total: number }).total).toBe(1000);
      const datasetEdges = await prisma.contentLearningDependency.findMany({
        where: { derivedKind: 'dataset', derivedId: dataset.id },
      });
      expect(
        datasetEdges.filter((edge) => edge.sourceKind === 'reward'),
      ).toHaveLength(1000);
      expect(
        datasetEdges.filter((edge) => edge.sourceKind === 'consent'),
      ).toHaveLength(10);
    }, 120000);

    it('excludes publication authority corruption while standalone pin digest remains independent', async () => {
      await seed(1000);
      const source = publications[0].source;
      const finalization =
        await prisma.postPublishFinalization.findUniqueOrThrow({
          where: { id: source.finalizationId },
        });
      const originalPin = await prisma.contentVersionPin.findUniqueOrThrow({
        where: { id: source.versionPinId },
      });
      const attemptedId = randomUUID();
      const attemptedKey = `malformed-${randomUUID()}`;
      const originalPinCount = await prisma.contentVersionPin.count({
        where: { organizationId: originalPin.organizationId },
      });
      await expect(
        pool.query(
          `INSERT INTO content_version_pins
           (id, "organizationId", "brandId", "createdByUserId", "recordKind", "recordId", "recordVersion", "contentDigest", "idempotencyKey", provenance)
           SELECT $1, "organizationId", "brandId", "createdByUserId", "recordKind", "recordId", "recordVersion", $2, $3, provenance
           FROM content_version_pins WHERE id=$4 AND "organizationId"=$5`,
          [
            attemptedId,
            'legacy',
            attemptedKey,
            originalPin.id,
            originalPin.organizationId,
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'content_version_pins_digest_check',
      });
      expect(
        await prisma.contentVersionPin.findUnique({
          where: { id: attemptedId },
        }),
      ).toBeNull();
      expect(
        await prisma.contentVersionPin.findFirst({
          where: {
            organizationId: originalPin.organizationId,
            idempotencyKey: attemptedKey,
          },
        }),
      ).toBeNull();
      expect(
        await prisma.contentVersionPin.count({
          where: { organizationId: originalPin.organizationId },
        }),
      ).toBe(originalPinCount);
      expect(
        await prisma.contentVersionPin.findUniqueOrThrow({
          where: { id: originalPin.id },
        }),
      ).toEqual(originalPin);
      expect(originalPin.contentDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
      const wrongDigest = `${originalPin.contentDigest.slice(0, -1)}${originalPin.contentDigest.endsWith('0') ? '1' : '0'}`;
      expect(wrongDigest).not.toBe(originalPin.contentDigest);
      expect(wrongDigest).toMatch(/^sha256:v1:[0-9a-f]{64}$/);
      const wrongPin = await prisma.contentVersionPin.create({
        data: {
          id: randomUUID(),
          organizationId: originalPin.organizationId,
          brandId: originalPin.brandId,
          createdByUserId: originalPin.createdByUserId,
          recordKind: originalPin.recordKind,
          recordId: originalPin.recordId,
          recordVersion: originalPin.recordVersion,
          contentDigest: wrongDigest,
          provenance: originalPin.provenance as Prisma.InputJsonValue,
          idempotencyKey: `wrong-digest-${randomUUID()}`,
        },
      });
      const cases: Array<{
        name: string;
        corrupt: () => Promise<unknown>;
        restore: () => Promise<unknown>;
      }> = [
        {
          name: 'inactive brand',
          corrupt: () =>
            prisma.brand.update({
              where: { id: source.brandId },
              data: { isActive: false },
            }),
          restore: () =>
            prisma.brand.update({
              where: { id: source.brandId },
              data: { isActive: true },
            }),
        },
        {
          name: 'disconnected credential',
          corrupt: () =>
            prisma.credential.update({
              where: { id: source.credentialId },
              data: { isConnected: false },
            }),
          restore: () =>
            prisma.credential.update({
              where: { id: source.credentialId },
              data: { isConnected: true },
            }),
        },
        {
          name: 'deleted organization',
          corrupt: () =>
            prisma.organization.update({
              where: { id: source.organizationId },
              data: { isDeleted: true },
            }),
          restore: () =>
            prisma.organization.update({
              where: { id: source.organizationId },
              data: { isDeleted: false },
            }),
        },
        {
          name: 'private publication',
          corrupt: () =>
            prisma.post.update({
              where: { id: source.postId },
              data: { visibility: 'private' },
            }),
          restore: () =>
            prisma.post.update({
              where: { id: source.postId },
              data: { visibility: 'public' },
            }),
        },
        {
          name: 'draft publication',
          corrupt: () =>
            prisma.post.update({
              where: { id: source.postId },
              data: { targetExecutionState: 'draft' },
            }),
          restore: () =>
            prisma.post.update({
              where: { id: source.postId },
              data: { targetExecutionState: 'published' },
            }),
        },
        {
          name: 'changed published text',
          corrupt: () =>
            prisma.post.update({
              where: { id: source.postId },
              data: { description: 'corrupt' },
            }),
          restore: () =>
            prisma.post.update({
              where: { id: source.postId },
              data: { description: 'Fixture publication 0' },
            }),
        },
        {
          name: 'nonserving approved state',
          corrupt: () =>
            prisma.publishApproval.update({
              where: { id: source.approvalId },
              data: { status: 'approved' },
            }),
          restore: () =>
            prisma.publishApproval.update({
              where: { id: source.approvalId },
              data: { status: 'published' },
            }),
        },
        {
          name: 'mismatched publication digest',
          corrupt: () =>
            prisma.$transaction([
              prisma.post.update({
                where: { id: source.postId },
                data: { reviewVersionPinId: wrongPin.id },
              }),
              prisma.publishApproval.update({
                where: { id: source.approvalId },
                data: { artifactVersionPinId: wrongPin.id },
              }),
            ]),
          restore: () =>
            prisma.$transaction([
              prisma.post.update({
                where: { id: source.postId },
                data: { reviewVersionPinId: source.versionPinId },
              }),
              prisma.publishApproval.update({
                where: { id: source.approvalId },
                data: { artifactVersionPinId: source.versionPinId },
              }),
            ]),
        },
        {
          name: 'legacy finalization result',
          corrupt: () =>
            prisma.postPublishFinalization.update({
              where: { id: source.finalizationId },
              data: { result: {} },
            }),
          restore: () =>
            prisma.postPublishFinalization.update({
              where: { id: source.finalizationId },
              data: { result: finalization.result as Prisma.InputJsonValue },
            }),
        },
      ];
      for (const change of cases) {
        await clearOutputs();
        await change.corrupt();
        try {
          expect(
            await resolveLearningPublicationSourceV1(
              prisma,
              'org-0',
              source.postId,
            ),
            change.name,
          ).toBeNull();
          const graph = new LearningDatasetGraph(prisma);
          expect(
            await graph.pins('post', [source.postId], 'org-0'),
            change.name,
          ).toEqual(new Map());
          expect(
            await graph.pins(
              'content_version_pin',
              [
                change.name === 'mismatched publication digest'
                  ? wrongPin.id
                  : source.versionPinId,
              ],
              'org-0',
            ),
            change.name,
          ).toEqual(
            new Map([
              [
                change.name === 'mismatched publication digest'
                  ? wrongPin.id
                  : source.versionPinId,
                change.name === 'mismatched publication digest'
                  ? wrongDigest
                  : source.contentDigest,
              ],
            ]),
          );
          const dataset = await service.create({
            ...input,
            requestId: randomUUID(),
            sourceAccounts: sources,
          });
          expect((dataset.counts as { total: number }).total, change.name).toBe(
            change.name === 'deleted organization'
              ? 500
              : change.name === 'inactive brand'
                ? 500
                : 900,
          );
        } finally {
          await change.restore();
        }
        expect(
          await prisma.contentVersionPin.findUniqueOrThrow({
            where: { id: originalPin.id },
          }),
        ).toEqual(originalPin);
        expect(
          await prisma.contentVersionPin.findUniqueOrThrow({
            where: { id: wrongPin.id },
          }),
        ).toEqual(wrongPin);
      }
      for (const ref of publications[0].refs.filter((ref) =>
        ['post', 'publish_approval', 'post_publish_finalization'].includes(
          ref.kind,
        ),
      )) {
        await clearOutputs();
        const legacy =
          ref.kind === 'post'
            ? source.postId
            : ref.kind === 'publish_approval'
              ? source.versionPinId
              : '2026-09-01T00:00:00.000Z';
        await prisma.contentLearningDependency.updateMany({
          where: {
            derivedKind: 'checkpoint',
            derivedId: checkpointIds[0],
            sourceKind: ref.kind,
          },
          data: { sourceVersion: legacy },
        });
        try {
          const dataset = await service.create({
            ...input,
            requestId: randomUUID(),
            sourceAccounts: sources,
          });
          expect((dataset.counts as { total: number }).total).toBe(900);
        } finally {
          await prisma.contentLearningDependency.updateMany({
            where: {
              derivedKind: 'checkpoint',
              derivedId: checkpointIds[0],
              sourceKind: ref.kind,
            },
            data: { sourceVersion: ref.version },
          });
        }
      }
      await expect(
        prisma.contentVersionPin.update({
          where: { id: source.versionPinId },
          data: { organizationId: 'org-1' },
        }),
      ).rejects.toThrow();
    }, 120000);

    it('actual exclusive publication writer waits behind snapshot F and invalidates after commit; inverse order excludes', async () => {
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
      const snapshot = service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      });
      let withdrawal: Promise<unknown> | undefined;
      try {
        await Promise.race([
          held.promise,
          snapshot.then(() => {
            throw new Error('Snapshot finished before publication barrier');
          }),
        ]);
        withdrawal = withdrawLearningDatasetPublication(
          prisma,
          publications[0].source.postId,
          'org-0',
        );
        await expect
          .poll(async () =>
            Number(
              (
                await pool.query(
                  "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted",
                )
              ).rows[0].count,
            ),
          )
          .toBeGreaterThan(0);
        release.resolve();
        const dataset = await snapshot;
        await withdrawal;
        expect(
          (
            await prisma.contentLearningDataset.findUniqueOrThrow({
              where: { id: dataset.id },
            })
          ).status,
        ).toBe('invalidated');
      } finally {
        beforeDecisionLock = undefined;
        release.resolve();
        await snapshot.catch(() => undefined);
        await withdrawal?.catch(() => undefined);
      }
      await seed(1000);
      await withdrawLearningDatasetPublication(
        prisma,
        publications[0].source.postId,
        'org-0',
      );
      const excluded = await service.create({
        ...input,
        requestId: randomUUID(),
        sourceAccounts: sources,
      });
      expect((excluded.counts as { total: number }).total).toBe(900);
    }, 120000);
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
    it.skipIf(!diagnostic)(
      'profiles one 10k and one 100k consented snapshot without replacing acceptance matrix',
      async () => {
        for (const size of [10000, 100000]) {
          await seed(size);
          await measure(size, 'consented', 1, true);
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
          `CREATE FUNCTION fail_${table}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT count(*) FROM "${table}" ${table === 'content_learning_dependencys' ? 'WHERE "derivedKind" = \'dataset\'' : ''}) >= 1000 THEN RAISE EXCEPTION 'injected late batch failure'; END IF; RETURN NULL; END $$`,
        );
        await pool.query(
          `CREATE TRIGGER fail_insert BEFORE INSERT ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION fail_${table}()`,
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
        await pool.query(
          change,
          change.includes('$1')
            ? [
                change.startsWith('UPDATE posts')
                  ? publications[0].source.postId
                  : checkpointIds[0],
              ]
            : [],
        );
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
        `UPDATE content_learning_checkpoints SET revision=1 WHERE id=$1`,
        `UPDATE posts SET "isDeleted"=true WHERE id=$1`,
        `UPDATE content_learning_dependencys SET valid=false WHERE id='edge-0-checkpoint'`,
      ]) {
        await seed(1000);
        await pool.query(
          change,
          change.includes('$1')
            ? [
                change.startsWith('UPDATE posts')
                  ? publications[0].source.postId
                  : checkpointIds[0],
              ]
            : [],
        );
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
      get checkpointId() {
        return checkpointIds[0];
      },
      get baselineId() {
        return baselineIds[0];
      },
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
