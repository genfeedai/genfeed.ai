import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { AgentImportedSourceIngestService } from '@api/services/agent-source-ingest/agent-imported-source-ingest.service';
import {
  mergeSourceCaptureIngest,
  parseSourceCaptureIngest,
} from '@api/services/agent-source-ingest/agent-imported-source-ingest.state';
import {
  AgentSourceDownloadService,
  AgentSourceImportPendingError,
} from '@api/services/agent-source-ingest/agent-source-download.service';
import type {
  AgentImportedMediaRecord,
  AgentImportedSourceIngestInput,
  AgentSourceArtifact,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientOrigin } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  id: 'different-subject',
  userId: 'LegacyUser7Qp2Rk9sX4N6b8',
  organizationId: 'corg12345678',
  brandId: 'cbrand12345678',
};
const scope = {
  organizationId: user.organizationId,
  brandId: user.brandId,
  userId: user.userId,
};
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const retryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let rows: AgentImportedMediaRecord[];
let input: AgentImportedSourceIngestInput;
let db: ReturnType<typeof database>;
let service: AgentImportedSourceIngestService;
const downloader = {
  normalizeUrl: vi.fn(async (url: string) => url),
  download: vi.fn(),
  observeQueuedSource: vi.fn(),
};
function matches(
  row: AgentImportedMediaRecord,
  where: Prisma.IngredientWhereInput = {},
): boolean {
  for (const key of [
    'id',
    'organizationId',
    'brandId',
    'category',
    'status',
    'version',
    'isDeleted',
  ] as const)
    if (where[key] !== undefined && where[key] !== row[key]) return false;
  if (
    typeof where.sourceActionId === 'string' &&
    row.sourceActionId !== where.sourceActionId
  )
    return false;
  if (
    typeof where.sourceActionId === 'object' &&
    where.sourceActionId &&
    typeof where.sourceActionId.startsWith === 'string' &&
    !row.sourceActionId?.startsWith(where.sourceActionId.startsWith)
  )
    return false;
  if (
    where.providerData &&
    typeof where.providerData === 'object' &&
    'equals' in where.providerData &&
    JSON.stringify(where.providerData.equals) !==
      JSON.stringify(row.providerData)
  )
    return false;
  return true;
}
function stored(value: unknown): Prisma.JsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}
function database() {
  let queue = Promise.resolve();
  const ingredient = {
    findFirst: vi.fn(async (args: Prisma.IngredientFindFirstArgs) =>
      structuredClone(rows.find((row) => matches(row, args.where)) ?? null),
    ),
    findMany: vi.fn(async (args: Prisma.IngredientFindManyArgs) =>
      structuredClone(
        rows
          .filter((row) => matches(row, args.where))
          .slice(0, args.take ?? rows.length),
      ),
    ),
    create: vi.fn(async (args: Prisma.IngredientCreateArgs) => {
      const data = args.data;
      if (rows.some((row) => row.id === data.id)) throw { code: 'P2002' };
      const row: AgentImportedMediaRecord = {
        id: data.id ?? '',
        organizationId:
          data.organizationId ?? data.organization?.connect?.id ?? null,
        brandId: data.brandId ?? data.brand?.connect?.id ?? null,
        category: data.category ?? 'TEXT',
        status: data.status ?? 'DRAFT',
        version: data.version ?? 1,
        sourceActionId: data.sourceActionId ?? null,
        providerData: stored(data.providerData),
        isDeleted: data.isDeleted ?? false,
        s3Key: data.s3Key ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return structuredClone(row);
    }),
    updateMany: vi.fn(async (args: Prisma.IngredientUpdateManyArgs) => {
      const selected = rows.filter((row) => matches(row, args.where));
      for (const row of selected)
        Object.assign(row, args.data, {
          providerData:
            args.data.providerData === undefined
              ? row.providerData
              : stored(args.data.providerData),
          updatedAt: new Date(),
        });
      return { count: selected.length };
    }),
    update: vi.fn(async (args: Prisma.IngredientUpdateArgs) => {
      const row = rows.find((row) => matches(row, args.where));
      if (!row) throw { code: 'P2025' };
      return structuredClone(row);
    }),
  };
  const api = {
    ingredient,
    brand: { findFirst: vi.fn(async () => ({ id: scope.brandId })) },
    $queryRaw: vi.fn(
      async (query: TemplateStringsArray, ...values: unknown[]) =>
        query.join('').includes('FOR UPDATE')
          ? rows
              .filter(
                (row) =>
                  row.id === values[0] &&
                  row.organizationId === values[1] &&
                  row.brandId === values[2] &&
                  row.category === 'TEXT' &&
                  !row.isDeleted,
              )
              .map((row) => ({ id: row.id }))
          : [],
    ),
  };
  return {
    ...api,
    $transaction: vi.fn(
      <T>(
        operation: (tx: typeof api) => Promise<T>,
        _options?: unknown,
      ): Promise<T> => {
        const result = queue.then(async () => {
          const before = structuredClone(rows);
          try {
            return await operation(api);
          } catch (error) {
            rows = before;
            throw error;
          }
        });
        queue = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    ),
  };
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
function media(): AgentImportedMediaRecord {
  const row = rows.find((row) => row.category !== 'TEXT');
  if (!row) throw new Error('Test media fixture absent');
  return row;
}
function expire(): void {
  const row = media();
  const ingest = parseSourceCaptureIngest(row.providerData);
  row.providerData = stored(
    mergeSourceCaptureIngest(row.providerData, {
      ...ingest,
      startedAt: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
      leaseUntil: new Date(Date.now() - 60 * 1000).toISOString(),
    }),
  );
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
async function capture(selection?: {
  kind: 'video';
  url: string;
  availability: 'accessible' | 'unknown' | 'embed_only' | 'unavailable';
}) {
  const result = await new ImportedSourcesService(
    db as unknown as PrismaService,
  ).save(user, scope.brandId, {
    snapshot: {
      kind: 'page',
      canonicalUrl: 'https://example.com/source',
      title: 'Source',
      capturedText: 'original',
      contentBasis: 'visible_page',
      ...(selection ? { selectedMedia: selection } : {}),
    },
  });
  return {
    sourceId: result.id,
    sourceIdentityDigest: result.identityDigest,
    sourceRecordVersion: result.recordVersion,
    title: result.snapshot.title,
    selectedMedia: result.snapshot.selectedMedia,
    requestId,
  };
}
beforeEach(async () => {
  rows = [];
  db = database();
  vi.resetAllMocks();
  downloader.normalizeUrl.mockImplementation(async (url: string) => url);
  downloader.download.mockImplementation(async (_url: string, id: string) =>
    artifact(id),
  );
  service = new AgentImportedSourceIngestService(
    db as unknown as PrismaService,
    downloader as unknown as AgentSourceDownloadService,
  );
  input = await capture({
    kind: 'video',
    url: 'https://media.example/original.mp4',
    availability: 'accessible',
  });
  vi.clearAllMocks();
});
it.each([undefined, 'embed_only', 'unavailable'] as const)(
  'unavailable selection %s makes no normalization, download, job or write call',
  async (availability) => {
    input = await capture(
      availability
        ? {
            kind: 'video',
            url: 'https://media.example/original.mp4',
            availability,
          }
        : undefined,
    );
    vi.clearAllMocks();
    expect(await service.start(input, scope)).toMatchObject({
      state: 'unavailable',
      bindingRevision: 0,
      canRetry: false,
    });
    expect(await service.observe(input, scope)).toMatchObject({
      state: 'unavailable',
    });
    await expect(
      service.retry({ ...input, expectedIngestRevision: 1 }, scope),
    ).rejects.toMatchObject({ status: 409 });
    expect(downloader.normalizeUrl).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(downloader.observeQueuedSource).not.toHaveBeenCalled();
    expect(db.ingredient.updateMany).not.toHaveBeenCalled();
    expect(db.ingredient.create).not.toHaveBeenCalled();
  },
);
it('accessible GET is not_requested without network or writes', async () => {
  expect(await service.observe(input, scope)).toMatchObject({
    state: 'not_requested',
    bindingRevision: 0,
  });
  expect(downloader.normalizeUrl).not.toHaveBeenCalled();
  expect(db.ingredient.create).not.toHaveBeenCalled();
});
it('claims one USER media asset, awaited durable result and immutable source binding with canonical actor', async () => {
  const original = structuredClone(rows[0]);
  const result = await service.start(input, scope);
  expect(result).toMatchObject({
    id: input.sourceId,
    state: 'ready',
    bindingRevision: 1,
    ingestRevision: 1,
    canRetry: false,
    artifact: {
      organizationId: scope.organizationId,
      brandId: scope.brandId,
      recordId: media().id,
      recordVersion: '1',
    },
  });
  expect(db.ingredient.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        user: { connect: { id: scope.userId } },
        organization: { connect: { id: scope.organizationId } },
        brand: { connect: { id: scope.brandId } },
        origin: IngredientOrigin.IMPORTED,
        scope: 'USER',
        category: 'VIDEO',
        status: 'PROCESSING',
        version: 1,
      }),
    }),
  );
  expect(media().sourceActionId).toBe(
    `imported-source-media:v1:${media().id.slice(1)}`,
  );
  expect(rows[0].version).toBe(original.version);
  expect((rows[0].providerData as Prisma.JsonObject).importedSource).toEqual(
    (original.providerData as Prisma.JsonObject).importedSource,
  );
  const ingest = parseSourceCaptureIngest(media().providerData);
  expect(ingest.actorUserId).toBe(scope.userId);
  expect(ingest.storageId).not.toBe(media().id);
  expect(downloader.download).toHaveBeenCalledWith(
    input.selectedMedia?.url,
    ingest.storageId,
    'video',
    { organizationId: scope.organizationId, userId: scope.userId },
    undefined,
    expect.any(Function),
    { requeueMissingJob: false, requireJobIdentity: true },
  );
  for (const privateField of [
    'jobId',
    'requestId',
    'storageId',
    'userId',
    'publicUrl',
    's3Key',
  ])
    expect(result).not.toHaveProperty(privateField);
});
it('ready repeated start across members observes without normalization or reimport', async () => {
  await service.start(input, scope);
  vi.clearAllMocks();
  downloader.normalizeUrl.mockRejectedValue(new Error('unsafe'));
  expect(
    await service.start(
      { ...input, requestId: retryId },
      { ...scope, userId: 'OtherCanonicalUser' },
    ),
  ).toMatchObject({ state: 'ready' });
  expect(downloader.normalizeUrl).not.toHaveBeenCalled();
  expect(downloader.download).not.toHaveBeenCalled();
});
it('normalization rejection before first claim is unavailable with no state write', async () => {
  downloader.normalizeUrl.mockRejectedValue(new Error('unsafe private URL'));
  expect(await service.start(input, scope)).toMatchObject({
    state: 'unavailable',
    bindingRevision: 0,
  });
  expect(rows).toHaveLength(1);
  expect(db.ingredient.create).not.toHaveBeenCalled();
  expect(db.ingredient.updateMany).not.toHaveBeenCalled();
  expect(downloader.download).not.toHaveBeenCalled();
});
it('claimed validation failure is failed while transport ambiguity is uncertain; starts do not retry', async () => {
  downloader.download.mockRejectedValueOnce(
    new BadRequestException('unsupported media'),
  );
  expect(await service.start(input, scope)).toMatchObject({
    state: 'failed',
    canRetry: true,
    errorCode: 'SOURCE_MEDIA_FAILED',
  });
  vi.clearAllMocks();
  expect(await service.start(input, scope)).toMatchObject({ state: 'failed' });
  expect(downloader.download).not.toHaveBeenCalled();
  downloader.download.mockRejectedValueOnce(new Error('ambiguous storage'));
  expect(
    await service.retry(
      { ...input, requestId: retryId, expectedIngestRevision: 1 },
      scope,
    ),
  ).toMatchObject({ state: 'uncertain', canRetry: false });
  expire();
  expect(await service.observe(input, scope)).toMatchObject({
    state: 'uncertain',
    canRetry: true,
  });
});
it('unit transaction model claims one dispatch for twelve starts, not real database proof', async () => {
  const outputs = await Promise.all(
    Array.from({ length: 12 }, () => service.start(input, scope)),
  );
  expect(downloader.download).toHaveBeenCalledTimes(1);
  expect(new Set(outputs.map((view) => view.ingredientId)).size).toBe(1);
  expect(rows).toHaveLength(2);
});
it('explicit retry tuple replays one increment/dispatch and changes storage even if request UUID repeats', async () => {
  downloader.download.mockRejectedValueOnce(new BadRequestException('failed'));
  await service.start(input, scope);
  const first = parseSourceCaptureIngest(media().providerData);
  await Promise.all(
    Array.from({ length: 12 }, () =>
      service.retry({ ...input, expectedIngestRevision: 1 }, scope),
    ),
  );
  expect(media().version).toBe(2);
  const next = parseSourceCaptureIngest(media().providerData);
  expect(next.storageId).not.toBe(first.storageId);
  expect(next.attemptId).toBe(first.attemptId);
  expect(downloader.download).toHaveBeenCalledTimes(2);
  await expect(
    service.retry(
      { ...input, requestId: retryId, expectedIngestRevision: 1 },
      scope,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(downloader.download).toHaveBeenCalledTimes(2);
});
it('failed retry normalization leaves original revision and binding untouched', async () => {
  downloader.download.mockRejectedValueOnce(new BadRequestException('failed'));
  await service.start(input, scope);
  const before = structuredClone(rows);
  downloader.normalizeUrl.mockRejectedValue(new Error('unsafe'));
  expect(
    await service.retry(
      { ...input, requestId: retryId, expectedIngestRevision: 1 },
      scope,
    ),
  ).toMatchObject({
    state: 'unavailable',
    bindingRevision: 1,
    canRetry: false,
  });
  expect(rows).toEqual(before);
});
it.each(['deleted', 'foreign', 'missing'])(
  'bound media %s is unavailable to GET/start and404 to retry without replacement',
  async (kind) => {
    await service.start(input, scope);
    if (kind === 'deleted') media().isDeleted = true;
    else if (kind === 'foreign') media().organizationId = 'cotherorg123456';
    else rows = rows.filter((row) => row.category === 'TEXT');
    vi.clearAllMocks();
    for (const result of [
      await service.observe(input, scope),
      await service.start(input, scope),
    ]) {
      expect(result).toMatchObject({
        state: 'unavailable',
        bindingRevision: 1,
        mediaKind: 'video',
        canRetry: false,
      });
      expect(result).not.toHaveProperty('ingredientId');
    }
    await expect(
      service.retry({ ...input, expectedIngestRevision: 1 }, scope),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.ingredient.create).not.toHaveBeenCalled();
    expect(downloader.normalizeUrl).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
  },
);
it('same-scope malformed media and server input changes conflict before network or repair', async () => {
  for (const patch of [
    { title: 'changed' },
    { sourceRecordVersion: 2 },
    { sourceIdentityDigest: 'b'.repeat(64) },
    { selectedMedia: { ...input.selectedMedia, kind: 'image' } },
  ])
    await expect(
      service.start(
        { ...input, ...patch } as AgentImportedSourceIngestInput,
        scope,
      ),
    ).rejects.toMatchObject({ status: 409 });
  expect(downloader.normalizeUrl).not.toHaveBeenCalled();
  await service.start(input, scope);
  media().providerData = stored({ sourceCaptureIngest: {} });
  await expect(service.observe(input, scope)).rejects.toMatchObject({
    status: 409,
  });
});
it('persists queued identity before enqueue callback, observes with initiating actor, and active jobs block retry after lease', async () => {
  downloader.download.mockImplementationOnce(
    async (
      _url: string,
      storageId: string,
      _kind: string,
      _scope: unknown,
      _job: unknown,
      queued: (id: string) => Promise<void>,
    ) => {
      await queued(`agent-source-${storageId}`);
      expect(parseSourceCaptureIngest(media().providerData)).toMatchObject({
        state: 'submitted',
        jobId: `agent-source-${storageId}`,
      });
      throw new AgentSourceImportPendingError();
    },
  );
  await service.start(input, scope);
  expire();
  downloader.observeQueuedSource.mockResolvedValue({ state: 'pending' });
  expect(
    await service.observe(input, {
      ...scope,
      userId: 'DifferentObservingUser',
    }),
  ).toMatchObject({ state: 'processing', canRetry: false });
  const ingest = parseSourceCaptureIngest(media().providerData);
  expect(downloader.observeQueuedSource).toHaveBeenCalledWith(
    ingest.storageId,
    ingest.jobId,
    { organizationId: scope.organizationId, userId: scope.userId },
    input.selectedMedia?.url,
  );
  await expect(
    service.retry(
      { ...input, requestId: retryId, expectedIngestRevision: 1 },
      scope,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(downloader.download).toHaveBeenCalledTimes(1);
});
it('queued observation normalization failure keeps attempt uncertain without jobGET or binding change', async () => {
  downloader.download.mockImplementationOnce(
    async (
      _url: string,
      id: string,
      _kind: string,
      _scope: unknown,
      _job: unknown,
      queued: (id: string) => Promise<void>,
    ) => {
      await queued(`agent-source-${id}`);
      throw new AgentSourceImportPendingError();
    },
  );
  await service.start(input, scope);
  const source = structuredClone(rows[0]);
  downloader.normalizeUrl.mockRejectedValue(new Error('safety failed'));
  expect(await service.observe(input, scope)).toMatchObject({
    state: 'uncertain',
    canRetry: false,
  });
  expect(downloader.observeQueuedSource).not.toHaveBeenCalled();
  expect(rows[0]).toEqual(source);
  expect(parseSourceCaptureIngest(media().providerData).jobId).toBeTruthy();
});
it.each([false, true])(
  'late completion under retired storage cannot overwrite explicit retry result (source deleted=%s)',
  async (sourceDeleted) => {
    const paused = barrier();
    downloader.download.mockImplementationOnce(async () => paused.promise);
    const old = service.start(input, scope);
    const rejected = expect(old).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() =>
      expect(downloader.download).toHaveBeenCalledTimes(1),
    );
    const first = parseSourceCaptureIngest(media().providerData);
    expire();
    await service.observe(input, scope);
    const current = await service.retry(
      { ...input, requestId: retryId, expectedIngestRevision: 1 },
      scope,
    );
    const key = media().s3Key;
    const previous = structuredClone(media());
    rows[0].isDeleted = sourceDeleted;
    paused.resolve(artifact(first.storageId));
    await rejected;
    expect(current.state).toBe('ready');
    expect(media().s3Key).toBe(key);
    expect(media().version).toBe(2);
    expect(media()).toEqual(previous);
  },
);
it('source deletion during paused transfer prevents linkage and fails only that current attempt', async () => {
  const paused = barrier();
  downloader.download.mockImplementationOnce(async () => paused.promise);
  const work = service.start(input, scope);
  const rejected = expect(work).rejects.toMatchObject({ status: 404 });
  await vi.waitFor(() => expect(downloader.download).toHaveBeenCalledTimes(1));
  const ingest = parseSourceCaptureIngest(media().providerData);
  rows[0].isDeleted = true;
  const readsBeforeCompletion = db.ingredient.findFirst.mock.calls.length;
  const metadataWritesBeforeCompletion = db.ingredient.update.mock.calls.length;
  const original = structuredClone(rows[0]);
  paused.resolve(artifact(ingest.storageId));
  await rejected;
  expect(media().status).toBe('FAILED');
  expect(parseSourceCaptureIngest(media().providerData)).toMatchObject({
    state: 'failed',
    ingestRevision: 1,
    errorCode: 'SOURCE_MEDIA_FAILED',
  });
  expect(media().s3Key).toBeNull();
  expect(rows[0]).toEqual(original);
  expect(db.ingredient.update.mock.calls.length).toBe(
    metadataWritesBeforeCompletion,
  );
  expect(
    db.ingredient.findFirst.mock.calls
      .slice(readsBeforeCompletion)
      .every(([args]) => args.where?.id !== input.sourceId),
  ).toBe(true);
  expect(await db.$transaction.mock.results.at(-1)?.value).toEqual({
    kind: 'source_missing',
  });
});
it('initial source JSON CAS misses roll back binding/asset rather than overwrite sibling edits', async () => {
  db.ingredient.updateMany.mockResolvedValueOnce({ count: 0 });
  await expect(service.start(input, scope)).rejects.toMatchObject({
    status: 409,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].providerData).not.toHaveProperty('importedSourceMedia');
});
it('P2002 without scoped matching source binding conflicts and cannot expose a foreign collision', async () => {
  db.ingredient.create.mockRejectedValueOnce({ code: 'P2002' });
  await expect(service.start(input, scope)).rejects.toMatchObject({
    status: 409,
  });
  expect(downloader.download).not.toHaveBeenCalled();
});

it('locks the active source before source reread and ready CAS inside completion', async () => {
  await service.start(input, scope);
  const lockIndex = db.$queryRaw.mock.calls.findIndex(([query]) =>
    query.join('').includes('FOR UPDATE'),
  );
  expect(lockIndex).toBeGreaterThanOrEqual(0);
  const lockOrder = db.$queryRaw.mock.invocationCallOrder[lockIndex];
  const sourceReads = db.ingredient.findFirst.mock.calls.map(
    ([args], index) => ({
      args,
      order: db.ingredient.findFirst.mock.invocationCallOrder[index],
    }),
  );
  expect(
    sourceReads.some(
      ({ args, order }) =>
        args.where?.id === input.sourceId && order > lockOrder,
    ),
  ).toBe(true);
  const readyIndex = db.ingredient.updateMany.mock.calls.findIndex(
    ([args]) => args.data.status === 'UPLOADED',
  );
  expect(
    db.ingredient.updateMany.mock.invocationCallOrder[readyIndex],
  ).toBeGreaterThan(lockOrder);
});
it.each(['missing', 'foreign'])(
  'source %s fails before claim or network',
  async (kind) => {
    if (kind === 'missing') rows[0].isDeleted = true;
    else rows[0].organizationId = 'cforeign12345678';
    for (const method of ['start', 'observe', 'retry'] as const) {
      await expect(
        service[method]({ ...input, expectedIngestRevision: 1 }, scope),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(downloader.normalizeUrl).not.toHaveBeenCalled();
    expect(downloader.download).not.toHaveBeenCalled();
    expect(db.ingredient.create).not.toHaveBeenCalled();
  },
);
