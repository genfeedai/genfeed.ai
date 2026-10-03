import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { AgentImportedSourceIngestService } from '@api/services/agent-source-ingest/agent-imported-source-ingest.service';
import {
  mergeSourceCaptureIngest,
  parseSourceCaptureIngest,
} from '@api/services/agent-source-ingest/agent-imported-source-ingest.state';
import type { AgentSourceDownloadService } from '@api/services/agent-source-ingest/agent-source-download.service';
import type {
  AgentImportedSourceIngestInput,
  AgentImportedSourceIngestScope,
  AgentSourceArtifact,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
const connectionString = process.env.IMPORTED_SOURCE_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      'Explicit safe local disposable imported-source database required.',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/genfeed_5859_disposable')
  )
    throw new Error(
      'Explicit safe local disposable imported-source database required.',
    );
}
function artifact(storageId: string): AgentSourceArtifact {
  return {
    kind: 'video',
    extension: 'MP4',
    storageKey: `ingredients/videos/${storageId}`,
    publicUrl: 'https://cdn.example/original',
    width: 1920,
    height: 1080,
    duration: 12,
    size: 900,
    hasAudio: true,
  };
}
type BackendPidRow = { pid: number };
type BlockerRow = { blockers: number[] };
function signalBarrier() {
  let resolve: () => void = () => {
    throw new Error('Uninitialized barrier');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function barrier() {
  let resolve: (value: AgentSourceArtifact) => void = () => {
    throw new Error('Uninitialized barrier');
  };
  const promise = new Promise<AgentSourceArtifact>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe.skipIf(!connectionString)(
  'imported media real PostgreSQL fences with mocked transfer',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const second = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function secondDatabase() {
      if (!second) throw new Error('Explicit disposable database absent.');
      return second;
    }
    function database() {
      if (!prisma) throw new Error('Explicit disposable database absent.');
      return prisma;
    }
    const downloader = {
      normalizeUrl: vi.fn(async (url: string) => url),
      download: vi.fn(),
      observeQueuedSource: vi.fn(),
    };
    let user: AuthenticatedUser;
    let scope: AgentImportedSourceIngestScope;
    let input: AgentImportedSourceIngestInput;
    let service: AgentImportedSourceIngestService;
    beforeEach(async () => {
      vi.resetAllMocks();
      downloader.normalizeUrl.mockImplementation(async (url: string) => url);
      downloader.download.mockImplementation(async (_url: string, id: string) =>
        artifact(id),
      );
      user = {
        id: randomUUID(),
        userId: randomUUID(),
        organizationId: randomUUID(),
        brandId: randomUUID(),
      };
      scope = {
        userId: user.userId,
        organizationId: user.organizationId,
        brandId: user.brandId,
      };
      const db = database();
      await db.user.create({
        data: { id: user.userId, handle: `source-media-${user.userId}` },
      });
      await db.organization.create({
        data: {
          id: user.organizationId,
          label: 'Imported media fixture',
          slug: `source-media-${user.organizationId}`,
          userId: user.userId,
        },
      });
      await db.brand.create({
        data: {
          id: user.brandId,
          organizationId: user.organizationId,
          userId: user.userId,
          label: 'Imported media fixture',
          slug: `source-media-${user.brandId}`,
        },
      });
      const source = await new ImportedSourcesService(
        db as unknown as PrismaService,
      ).save(user, scope.brandId, {
        snapshot: {
          kind: 'page',
          canonicalUrl: 'https://example.com/source',
          title: 'Original source',
          capturedText: 'Original text',
          contentBasis: 'visible_page',
          selectedMedia: {
            kind: 'video',
            url: 'https://media.example/original.mp4',
            availability: 'accessible',
          },
        },
      });
      input = {
        sourceId: source.id,
        sourceIdentityDigest: source.identityDigest,
        sourceRecordVersion: source.recordVersion,
        title: source.snapshot.title,
        selectedMedia: source.snapshot.selectedMedia,
        requestId: randomUUID(),
      };
      service = new AgentImportedSourceIngestService(
        db as unknown as PrismaService,
        downloader as unknown as AgentSourceDownloadService,
      );
    });
    afterEach(async () => {
      if (!user) return;
      const db = database();
      const metadataIds: string[] = [];
      for (const isDeleted of [false, true]) {
        const fixtures = await db.ingredient.findMany({
          where: {
            organizationId: user.organizationId,
            brandId: user.brandId,
            isDeleted,
          },
          select: { metadataId: true },
        });
        metadataIds.push(
          ...fixtures
            .map((row) => row.metadataId)
            .filter((id): id is string => id !== null),
        );
        await db.ingredient.deleteMany({
          where: {
            organizationId: user.organizationId,
            brandId: user.brandId,
            isDeleted,
          },
        });
      }
      if (metadataIds.length)
        await db.metadata.deleteMany({
          where: { id: { in: metadataIds }, isDeleted: false },
        });
      await db.brand.deleteMany({
        where: { id: user.brandId, organizationId: user.organizationId },
      });
      await db.organization.deleteMany({
        where: { id: user.organizationId, userId: user.userId },
      });
      await db.user.deleteMany({ where: { id: user.userId } });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
      await second?.$disconnect();
    });
    async function media() {
      const row = await database().ingredient.findFirst({
        where: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
          category: 'VIDEO',
        },
        include: { metadata: true },
      });
      if (!row) throw new Error('Owned media fixture absent');
      return row;
    }
    it('twelve simultaneous starts create one binding/media and dispatch one attempt', async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => service.start(input, scope)),
      );
      expect(downloader.download).toHaveBeenCalledTimes(1);
      expect(new Set(results.map((view) => view.ingredientId)).size).toBe(1);
      expect(
        await database().ingredient.count({
          where: {
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
            category: 'VIDEO',
          },
        }),
      ).toBe(1);
      const source = await database().ingredient.findFirst({
        where: {
          id: input.sourceId,
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          isDeleted: false,
        },
      });
      expect(source?.version).toBe(1);
      expect(source?.providerData).toHaveProperty('importedSourceMedia');
    });
    it('twelve explicit same-tuple retries create one new revision and attempt-specific storage', async () => {
      downloader.download.mockRejectedValueOnce(
        new BadRequestException('Controlled unsupported source'),
      );
      await service.start(input, scope);
      const original = parseSourceCaptureIngest((await media()).providerData);
      const retryInput = {
        ...input,
        requestId: randomUUID(),
        expectedIngestRevision: 1,
      };
      const outputs = await Promise.all(
        Array.from({ length: 12 }, () => service.retry(retryInput, scope)),
      );
      expect(new Set(outputs.map((view) => view.ingestRevision))).toEqual(
        new Set([2]),
      );
      expect(downloader.download).toHaveBeenCalledTimes(2);
      const row = await media();
      expect(row.version).toBe(2);
      expect(parseSourceCaptureIngest(row.providerData).storageId).not.toBe(
        original.storageId,
      );
    });
    it.each([false, true])(
      'retired attempt completion cannot overwrite retry after source deletion=%s',
      async (sourceDeleted) => {
        const paused = barrier();
        downloader.download.mockImplementationOnce(async () => paused.promise);
        const old = service.start(input, scope);
        const rejected = expect(old).rejects.toMatchObject({ status: 409 });
        let oldStorage = '';
        try {
          await vi.waitFor(() =>
            expect(downloader.download).toHaveBeenCalledTimes(1),
          );
          const row = await media();
          const first = parseSourceCaptureIngest(row.providerData);
          oldStorage = first.storageId;
          await database().ingredient.updateMany({
            where: {
              id: row.id,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              isDeleted: false,
              version: 1,
            },
            data: {
              providerData: mergeSourceCaptureIngest(row.providerData, {
                ...first,
                startedAt: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
                leaseUntil: new Date(Date.now() - 60 * 1000).toISOString(),
              }),
            },
          });
          await service.observe(input, scope);
          const current = await service.retry(
            { ...input, requestId: randomUUID(), expectedIngestRevision: 1 },
            scope,
          );
          expect(current.state).toBe('ready');
          const ready = await media();
          if (sourceDeleted)
            await database().ingredient.updateMany({
              where: {
                id: input.sourceId,
                organizationId: scope.organizationId,
                brandId: scope.brandId,
                isDeleted: false,
              },
              data: { isDeleted: true },
            });
          paused.resolve({ ...artifact(oldStorage), width: 11, size: 12 });
          await rejected;
          const final = await media();
          expect(final.s3Key).toBe(ready.s3Key);
          expect(final.s3Key).not.toBe(`ingredients/videos/${oldStorage}`);
          expect(final.version).toBe(2);
          expect(final.metadata?.width).toBe(1920);
          expect(final).toEqual(ready);
        } finally {
          paused.resolve(artifact(oldStorage));
          await Promise.allSettled([old]);
        }
      },
    );
    async function waitForBlocker(blockedPid: number, blockerPid: number) {
      await vi.waitFor(
        async () => {
          const rows = await database().$queryRaw<
            BlockerRow[]
          >`SELECT pg_blocking_pids(${blockedPid}::int) AS blockers`;
          expect(rows[0]?.blockers).toContain(blockerPid);
        },
        { timeout: 3000, interval: 25 },
      );
    }
    function completionBarrier(holdAfterLock: boolean) {
      let pid = 0;
      let acquired = false;
      const release = signalBarrier();
      const db = database();
      const wrapped = new Proxy(db, {
        get(target, property, receiver) {
          if (property !== '$transaction')
            return Reflect.get(target, property, receiver);
          return async <T>(
            callback: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: Parameters<PrismaClient['$transaction']>[1],
          ): Promise<T> =>
            target.$transaction(async (tx) => {
              const observed = new Proxy(tx, {
                get(transaction, key, transactionReceiver) {
                  if (key !== '$queryRaw')
                    return Reflect.get(transaction, key, transactionReceiver);
                  return async <R>(
                    query: TemplateStringsArray,
                    ...values: unknown[]
                  ): Promise<R> => {
                    const completion = query.join('').includes('FOR UPDATE');
                    if (completion) {
                      const rows = await transaction.$queryRaw<
                        BackendPidRow[]
                      >`SELECT pg_backend_pid() AS pid`;
                      pid = rows[0].pid;
                    }
                    const result = await transaction.$queryRaw<R>(
                      query,
                      ...values,
                    );
                    if (completion && holdAfterLock) {
                      acquired = true;
                      await release.promise;
                    }
                    return result;
                  };
                },
              });
              return callback(observed);
            }, options);
        },
      });
      return {
        client: wrapped,
        release,
        get pid() {
          return pid;
        },
        get acquired() {
          return acquired;
        },
      };
    }
    it('real finalization row lock blocks generic deletion until ready commit', async () => {
      const locked = completionBarrier(true);
      service = new AgentImportedSourceIngestService(
        locked.client as unknown as PrismaService,
        downloader as unknown as AgentSourceDownloadService,
      );
      const work = service.start(input, scope);
      let deletePid = 0;
      let deletion: Promise<number> | undefined;
      try {
        await vi.waitFor(() => expect(locked.acquired).toBe(true), {
          timeout: 3000,
        });
        deletion = secondDatabase().$transaction(
          async (tx) => {
            const pids = await tx.$queryRaw<
              BackendPidRow[]
            >`SELECT pg_backend_pid() AS pid`;
            deletePid = pids[0].pid;
            const changed = await tx.ingredient.updateMany({
              where: {
                id: input.sourceId,
                organizationId: scope.organizationId,
                brandId: scope.brandId,
                isDeleted: false,
              },
              data: { isDeleted: true },
            });
            return changed.count;
          },
          { maxWait: 5000, timeout: 10000 },
        );
        await vi.waitFor(() => expect(deletePid).toBeGreaterThan(0), {
          timeout: 3000,
        });
        await waitForBlocker(deletePid, locked.pid);
        locked.release.resolve();
        expect((await work).state).toBe('ready');
        expect(await deletion).toBe(1);
        const completed = await media();
        expect(completed.status).toBe('UPLOADED');
        expect(parseSourceCaptureIngest(completed.providerData).state).toBe(
          'ready',
        );
        await expect(service.observe(input, scope)).rejects.toMatchObject({
          status: 404,
        });
      } finally {
        locked.release.resolve();
        await Promise.allSettled([work, ...(deletion ? [deletion] : [])]);
      }
    });
    it('real generic deletion row lock blocks finalization then commits only current-attempt failure before404', async () => {
      const paused = barrier();
      const locked = completionBarrier(false);
      const releaseDelete = signalBarrier();
      service = new AgentImportedSourceIngestService(
        locked.client as unknown as PrismaService,
        downloader as unknown as AgentSourceDownloadService,
      );
      downloader.download.mockImplementationOnce(async () => paused.promise);
      const work = service.start(input, scope);
      const rejected = expect(work).rejects.toMatchObject({ status: 404 });
      let deletion: Promise<number> | undefined;
      let deletePid = 0;
      let storageId = '';
      try {
        await vi.waitFor(
          () => expect(downloader.download).toHaveBeenCalledTimes(1),
          { timeout: 3000 },
        );
        const originalMedia = await media();
        storageId = parseSourceCaptureIngest(
          originalMedia.providerData,
        ).storageId;
        await database().ingredient.updateMany({
          where: {
            id: originalMedia.id,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
          },
          data: {
            providerData: toPrismaJson({
              sourceCaptureIngest: parseSourceCaptureIngest(
                originalMedia.providerData,
              ),
              unrelated: { preserved: true },
            }),
          },
        });
        const source = await database().ingredient.findFirst({
          where: {
            id: input.sourceId,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
          },
        });
        expect(source).not.toBeNull();
        deletion = secondDatabase().$transaction(
          async (tx) => {
            const pids = await tx.$queryRaw<
              BackendPidRow[]
            >`SELECT pg_backend_pid() AS pid`;
            const changed = await tx.ingredient.updateMany({
              where: {
                id: input.sourceId,
                organizationId: scope.organizationId,
                brandId: scope.brandId,
                isDeleted: false,
              },
              data: { isDeleted: true },
            });
            deletePid = pids[0].pid;
            await releaseDelete.promise;
            return changed.count;
          },
          { maxWait: 5000, timeout: 10000 },
        );
        await vi.waitFor(() => expect(deletePid).toBeGreaterThan(0), {
          timeout: 3000,
        });
        paused.resolve(artifact(storageId));
        await vi.waitFor(() => expect(locked.pid).toBeGreaterThan(0), {
          timeout: 3000,
        });
        await waitForBlocker(locked.pid, deletePid);
        releaseDelete.resolve();
        expect(await deletion).toBe(1);
        await rejected;
        const final = await media();
        expect(final.status).toBe('FAILED');
        expect(final.s3Key).toBeNull();
        expect(final.metadata).toEqual(originalMedia.metadata);
        expect(final.providerData).toMatchObject({
          unrelated: { preserved: true },
          sourceCaptureIngest: {
            state: 'failed',
            ingestRevision: 1,
            storageId,
            errorCode: 'SOURCE_MEDIA_FAILED',
          },
        });
        const deleted = await database().ingredient.findFirst({
          where: {
            id: input.sourceId,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: true,
          },
        });
        expect(deleted?.providerData).toEqual(source?.providerData);
        expect(deleted?.version).toBe(source?.version);
      } finally {
        releaseDelete.resolve();
        paused.resolve(artifact(storageId));
        await Promise.allSettled([work, ...(deletion ? [deletion] : [])]);
      }
    });
    it('concurrent scoped providerData sibling writes survive finalization without changing original source', async () => {
      const paused = barrier();
      downloader.download.mockImplementationOnce(async () => paused.promise);
      const work = service.start(input, scope);
      let storageId = '';
      try {
        await vi.waitFor(() =>
          expect(downloader.download).toHaveBeenCalledTimes(1),
        );
        const row = await media();
        storageId = parseSourceCaptureIngest(row.providerData).storageId;
        const source = await database().ingredient.findFirst({
          where: {
            id: input.sourceId,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
          },
        });
        if (!source) throw new Error('Owned source fixture absent');
        await Promise.all([
          database().ingredient.updateMany({
            where: {
              id: source.id,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              isDeleted: false,
            },
            data: {
              providerData: toPrismaJson({
                ...(source.providerData as object),
                concurrentSourceSibling: 'preserved',
              }),
            },
          }),
          database().ingredient.updateMany({
            where: {
              id: row.id,
              organizationId: scope.organizationId,
              brandId: scope.brandId,
              isDeleted: false,
            },
            data: {
              providerData: toPrismaJson({
                ...(row.providerData as object),
                concurrentMediaSibling: 'preserved',
              }),
            },
          }),
        ]);
        paused.resolve(artifact(storageId));
        expect((await work).state).toBe('ready');
        expect((await media()).providerData).toHaveProperty(
          'concurrentMediaSibling',
          'preserved',
        );
        const after = await database().ingredient.findFirst({
          where: {
            id: source.id,
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            isDeleted: false,
          },
        });
        expect(after?.version).toBe(source.version);
        expect(after?.providerData).toMatchObject({
          concurrentSourceSibling: 'preserved',
        });
      } finally {
        paused.resolve(artifact(storageId));
        await Promise.allSettled([work]);
      }
    });
  },
);
