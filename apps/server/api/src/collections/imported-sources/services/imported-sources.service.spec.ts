import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ImportedSourceRecord } from '@api/collections/imported-sources/services/imported-source-state';
import { readImportedSourceEnvelope } from '@api/collections/imported-sources/services/imported-source-state';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { beforeEach, expect, it, vi } from 'vitest';

const user: AuthenticatedUser = {
  id: 'legacy-subject',
  userId: 'cuser12345678',
  organizationId: 'corganization123',
  brandId: 'cbrand12345678',
};
const input = {
  snapshot: {
    kind: 'article',
    canonicalUrl: 'https://example.com/article?token=x',
    title: 'Article',
    capturedText: ' Original text ',
    contentBasis: 'visible_selection',
  },
};
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let rows: ImportedSourceRecord[];
let service: ImportedSourcesService;
let db: ReturnType<typeof mockDatabase>;
function matches(
  row: ImportedSourceRecord,
  where: Prisma.IngredientWhereInput = {},
) {
  if (
    typeof where.organizationId === 'string' &&
    row.organizationId !== where.organizationId
  )
    return false;
  if (typeof where.brandId === 'string' && row.brandId !== where.brandId)
    return false;
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (typeof where.isDeleted === 'boolean' && row.isDeleted !== where.isDeleted)
    return false;
  if (
    typeof where.sourceActionId === 'string' &&
    row.sourceActionId !== where.sourceActionId
  )
    return false;
  if (
    where.sourceActionId &&
    typeof where.sourceActionId === 'object' &&
    typeof where.sourceActionId.startsWith === 'string' &&
    !row.sourceActionId?.startsWith(where.sourceActionId.startsWith)
  )
    return false;
  return true;
}
function mockDatabase() {
  let queue = Promise.resolve();
  const ingredient = {
    findMany: vi.fn(async (args: Prisma.IngredientFindManyArgs) =>
      rows
        .filter((row) => matches(row, args.where))
        .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length)),
    ),
    findFirst: vi.fn(
      async (args: Prisma.IngredientFindFirstArgs) =>
        rows
          .filter((row) => matches(row, args.where))
          .sort((a, b) => b.version - a.version)[0] ?? null,
    ),
    count: vi.fn(
      async (args: Prisma.IngredientCountArgs) =>
        rows.filter((row) => matches(row, args.where)).length,
    ),
    aggregate: vi.fn(async (args: Prisma.IngredientAggregateArgs) => ({
      _max: {
        version: Math.max(
          0,
          ...rows
            .filter((row) => matches(row, args.where))
            .map((row) => row.version),
        ),
      },
    })),
    create: vi.fn(async (args: Prisma.IngredientCreateArgs) => {
      const data = args.data as Prisma.IngredientUncheckedCreateInput;
      if (rows.some((row) => row.id === data.id)) throw { code: 'P2002' };
      const row: ImportedSourceRecord = {
        id: data.id ?? '',
        organizationId: data.organizationId ?? null,
        brandId: data.brandId ?? null,
        version: data.version ?? 1,
        sourceActionId: data.sourceActionId ?? null,
        providerData: JSON.parse(JSON.stringify(data.providerData)),
        isDeleted: data.isDeleted ?? false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.push(row);
      return row;
    }),
  };
  const tx = {
    ingredient,
    brand: {
      findFirst: vi.fn(
        async (): Promise<{ id: string | undefined } | null> => ({
          id: user.brandId,
        }),
      ),
    },
    $queryRaw: vi.fn(async () => []),
  };
  return {
    ...tx,
    $transaction: vi.fn(
      (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
        _options?: unknown,
      ) => {
        const next = queue.then(() =>
          operation(tx as unknown as Prisma.TransactionClient),
        );
        queue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      },
    ),
  };
}
beforeEach(() => {
  rows = [];
  db = mockDatabase();
  service = new ImportedSourcesService(db as unknown as PrismaService);
});
const save = () => service.save(user, user.brandId, input);
it('writes only USER TEXT DRAFT immutable Ingredient using canonical userId and no generation', async () => {
  const result = await save();
  expect(result.deduplicated).toBe(false);
  expect(result.snapshot.canonicalUrl).toBe('https://example.com/article');
  expect(db.ingredient.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id: result.id,
      category: 'TEXT',
      status: 'DRAFT',
      scope: 'USER',
      userId: user.userId,
      organizationId: user.organizationId,
      brandId: user.brandId,
      version: 1,
      isDeleted: false,
      isPublic: false,
    }),
  });
  const data = db.ingredient.create.mock.calls[0][0].data;
  for (const field of ['metadata', 'promptId', 'workflowId', 'postId'])
    expect(data).not.toHaveProperty(field);
  expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  expect(db.$transaction.mock.calls[0][1]).toEqual({
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000,
  });
});
it('reuses the immutable original across threads/users, and changed material yields a different source', async () => {
  const first = await save();
  const before = structuredClone(rows[0]);
  const second = await service.save(
    { ...user, userId: 'cotheruser1234' },
    user.brandId,
    {
      snapshot: { ...input.snapshot, clientCapturedAt: '2020-01-01T00:00:00Z' },
    },
  );
  expect(second.id).toBe(first.id);
  expect(second.deduplicated).toBe(true);
  expect(rows[0]).toEqual(before);
  const changed = await service.save(user, user.brandId, {
    snapshot: { ...input.snapshot, capturedText: 'Changed original' },
  });
  expect(changed.id).not.toBe(first.id);
  expect(rows).toHaveLength(2);
});
it('unit transaction model serializes repeated saves without pretending to prove PostgreSQL concurrency', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, save));
  expect(new Set(results.map((result) => result.id)).size).toBe(1);
  expect(rows).toHaveLength(1);
});
it('rejects API keys, missing canonical user and supplied foreign scope before persistence', async () => {
  for (const invalid of [
    { ...user, isApiKey: true },
    { ...user, apiKeyId: 'key' },
    { ...user, userId: '' },
  ])
    await expect(service.save(invalid, user.brandId, input)).rejects.toThrow();
  await expect(
    service.save(user, user.brandId, { ...input, organizationId: 'foreign' }),
  ).rejects.toMatchObject({ status: 400 });
  expect(db.ingredient.create).not.toHaveBeenCalled();
});
it('rejects deleted/foreign brand and scopes reads/list without user-controlled deletion filters', async () => {
  db.brand.findFirst.mockResolvedValueOnce(null);
  await expect(save()).rejects.toMatchObject({ status: 404 });
  expect(db.brand.findFirst).toHaveBeenCalledWith({
    where: {
      id: user.brandId,
      organizationId: user.organizationId,
      isDeleted: false,
    },
    select: { id: true },
  });
  const result = await save();
  await expect(
    service.get(
      { ...user, organizationId: 'cotherorg1234' },
      user.brandId,
      result.id,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(await service.list(user, user.brandId, {})).toMatchObject({
    docs: [{ id: result.id }],
    totalDocs: 1,
    totalPages: 1,
    page: 1,
    limit: 20,
    pagingCounter: 1,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
  });
  await expect(
    service.list(user, user.brandId, { isDeleted: true }),
  ).rejects.toMatchObject({ status: 400 });
});
it('empty and nonfirst pages retain canonical aggregate pagination', async () => {
  expect(await service.list(user, user.brandId, {})).toMatchObject({
    docs: [],
    totalPages: 0,
    totalDocs: 0,
  });
  await save();
  expect(
    await service.list(user, user.brandId, { page: 2, limit: 1 }),
  ).toMatchObject({
    docs: [],
    totalDocs: 1,
    totalPages: 1,
    pagingCounter: 2,
    hasPrevPage: true,
    prevPage: 1,
    nextPage: null,
  });
});
it('soft-deleted save returns explicit recapture conflict without resurrection', async () => {
  const original = await save();
  rows[0].isDeleted = true;
  const before = structuredClone(rows[0]);
  await expect(save()).rejects.toMatchObject({
    response: {
      code: 'IMPORTED_SOURCE_DELETED',
      deletedIngredientId: original.id,
    },
  });
  await expect(
    service.get(user, user.brandId, original.id),
  ).rejects.toMatchObject({ status: 404 });
  expect(rows[0]).toEqual(before);
});
it('same/different explicit request IDs converge on one successor and preserve deleted original', async () => {
  const original = await save();
  rows[0].isDeleted = true;
  const before = structuredClone(rows[0]);
  const recapture = (id: string) =>
    service.recapture(user, user.brandId, original.id, { requestId: id });
  const results = await Promise.all([
    recapture(requestId),
    recapture(requestId),
    recapture('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ]);
  expect(new Set(results.map((result) => result.id)).size).toBe(1);
  expect(results[0]).toMatchObject({
    recordVersion: 2,
    recapturedFromIngredientId: original.id,
  });
  expect(rows[0]).toEqual(before);
  expect(rows).toHaveLength(2);
  expect(readImportedSourceEnvelope(rows[1]).originIngredientId).toBe(
    original.id,
  );
});
it('retired request cannot resurrect; a new explicit key creates the next immutable revision', async () => {
  const original = await save();
  rows[0].isDeleted = true;
  const successor = await service.recapture(user, user.brandId, original.id, {
    requestId,
  });
  rows[1].isDeleted = true;
  await expect(
    service.recapture(user, user.brandId, original.id, { requestId }),
  ).rejects.toMatchObject({
    response: { code: 'IMPORTED_SOURCE_RECAPTURE_REQUEST_RETIRED' },
  });
  expect(
    await service.recapture(user, user.brandId, successor.id, {
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }),
  ).toMatchObject({
    recordVersion: 3,
    recapturedFromIngredientId: successor.id,
  });
});
it('rejects active target, corrupt history, duplicate active rows and bounded version overflow', async () => {
  const original = await save();
  await expect(
    service.recapture(user, user.brandId, original.id, { requestId }),
  ).rejects.toMatchObject({ status: 404 });
  rows.push({ ...rows[0] });
  await expect(save()).rejects.toMatchObject({
    response: { code: 'IMPORTED_SOURCE_DUPLICATE_CONFLICT' },
  });
  rows.pop();
  rows[0].version = 2;
  await expect(save()).rejects.toMatchObject({
    response: { code: 'IMPORTED_SOURCE_STATE_INVALID' },
  });
  rows[0].version = 1;
  rows[0].isDeleted = true;
  db.ingredient.aggregate.mockResolvedValue({ _max: { version: 2147483647 } });
  await expect(
    service.recapture(user, user.brandId, original.id, { requestId }),
  ).rejects.toMatchObject({
    response: { code: 'IMPORTED_SOURCE_STATE_INVALID' },
  });
});
it('P2002 readback accepts only a valid exact scoped active row; missing/foreign/corrupt collisions conflict', async () => {
  const original = await save();
  db.$transaction.mockRejectedValueOnce({ code: 'P2002' });
  expect(await save()).toMatchObject({ id: original.id, deduplicated: true });
  rows[0].organizationId = 'cotherorg1234';
  db.$transaction.mockRejectedValueOnce({ code: 'P2002' });
  await expect(save()).rejects.toMatchObject({
    response: { code: 'IMPORTED_SOURCE_ID_CONFLICT' },
  });
  rows[0].organizationId = user.organizationId;
  rows[0].providerData = {};
  db.$transaction.mockRejectedValueOnce({ code: 'P2002' });
  await expect(save()).rejects.toMatchObject({
    response: { code: 'IMPORTED_SOURCE_ID_CONFLICT' },
  });
});
it.each(['P2028', 'P2034', 'P1008', 'P2024'])(
  'transaction failure %s returns stable retryable503',
  async (code) => {
    db.$transaction.mockRejectedValueOnce({ code });
    await expect(save()).rejects.toMatchObject({
      status: 503,
      response: { code: 'IMPORTED_SOURCE_RETRYABLE' },
    });
  },
);
