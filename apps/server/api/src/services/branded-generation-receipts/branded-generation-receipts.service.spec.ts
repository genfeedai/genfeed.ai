import {
  canonicalizeBrandedGenerationJsonV1,
  hashBrandedGenerationOperationV1,
  hashBrandedGenerationRequestV1,
  hashBrandedGenerationResolutionV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import { encodeBrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile-codec.util';
import { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});
const actor = { organizationId: 'org', brandId: 'brand', actorId: 'user' };
function input(): BrandedGenerationInputV1 {
  return {
    schemaVersion: 1,
    ...actor,
    requestKey: 'request',
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'raw',
    originalPrompt: '  Exact 😀  ',
    provider: 'provider',
    model: 'model',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
    parentRequestId: 'parent',
    runId: 'run',
  };
}
function fixture() {
  const access = new BrandedGenerationReceiptAccessService();
  vi.spyOn(access, 'assertBrand').mockResolvedValue({ isOwnerOrAdmin: false });
  const prompts = new BrandedGenerationPromptStoreService(access);
  vi.spyOn(prompts, 'prepare').mockImplementation((text) => ({
    reference: {
      retention: 'retained',
      snapshotId: `prompt-${hashBrandedGenerationTextV1(text)}`,
      contentHash: hashBrandedGenerationTextV1(text),
    },
    record: {
      id: `prompt-${hashBrandedGenerationTextV1(text)}`,
      format: 'genfeed.branded-generation-prompt.v1',
      ciphertext: `${'a'.repeat(32)}:aa:${'b'.repeat(32)}`,
      contentHash: hashBrandedGenerationTextV1(text),
    },
  }));
  vi.spyOn(prompts, 'persist').mockResolvedValue();
  vi.spyOn(prompts, 'purge').mockResolvedValue();
  vi.spyOn(prompts, 'read').mockResolvedValue({
    status: 'retained',
    text: 'fixture',
    contentHash: hashBrandedGenerationTextV1('fixture'),
  });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'brand' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    brandedGenerationReceipt: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    brandedGenerationReceiptEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation(
        (run: (client: Prisma.TransactionClient) => Promise<unknown>) =>
          run(tx as unknown as Prisma.TransactionClient),
      ),
  };
  return {
    service: new BrandedGenerationReceiptsService(
      prisma as unknown as PrismaService,
      access,
      prompts,
    ),
    tx,
    prisma,
    prompts,
    access,
  };
}
function blockedResolution(): BrandedGenerationResolutionV1 {
  return {
    schemaVersion: 1,
    mode: 'raw',
    status: 'blocked',
    reasonCode: 'context_unavailable',
    snapshot: null,
    layers: [],
    diagnostics: [
      {
        code: 'context_unavailable',
        severity: 'error',
        message: 'Unavailable',
      },
    ],
    learning: {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'not_applicable',
        scope: { format: 'text', objective: 'engagement' },
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: ['no_destination'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: '2026-10-01T17:00:00.000Z',
        },
      },
    },
  };
}
async function saved(f: ReturnType<typeof fixture>) {
  const result = await f.service.create(input());
  f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
    projection: result.receipt,
    isDeleted: false,
  });
  return result.receipt;
}
describe('real storage slice orchestration with typed transaction delegates', () => {
  it('creates original snapshot/event atomically with zero provider attempts and preserved lineage', async () => {
    const f = fixture();
    const result = await f.service.create(input());
    const expectedProjection: unknown = JSON.parse(
      JSON.stringify(result.receipt),
    );
    expect(result.replayed).toBe(false);
    expect(result.receipt).toMatchObject({
      state: 'created',
      parentRequestId: 'parent',
      runId: 'run',
      execution: null,
      budget: { generationAttemptsUsed: 0 },
      costs: [],
    });
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    });
    expect(
      f.tx.brandedGenerationReceiptEvent.create.mock.calls[0][0].data,
    ).toMatchObject({
      operationKey: 'create',
      revision: 0,
      projection: expectedProjection,
    });
    expect(
      f.tx.brandedGenerationReceiptEvent.create.mock.calls[0][0].data
        .projection,
    ).toEqual(expectedProjection);
    expect(f.prompts.persist).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      result.receipt.id,
      0,
      'original',
      expect.anything(),
    );
    expect(f.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.$executeRaw.mock.invocationCallOrder[0],
    );
  });
  it('exact request replay has no new writes, preserves actor identity, and rejects tombstones/changed lineage', async () => {
    const f = fixture();
    const current = await saved(f);
    f.tx.brandedGenerationReceipt.create.mockClear();
    f.tx.brandedGenerationReceiptEvent.create.mockClear();
    vi.mocked(f.prompts.persist).mockClear();
    expect(await f.service.create(input())).toEqual({
      receipt: current,
      replayed: true,
    });
    expect(f.tx.brandedGenerationReceipt.create).not.toHaveBeenCalled();
    expect(f.prompts.persist).not.toHaveBeenCalled();
    expect(
      f.tx.brandedGenerationReceipt.findFirst.mock.calls.at(-1)?.[0].where,
    ).toEqual({
      organizationId: 'org',
      brandId: 'brand',
      requestKey: 'request',
      candidateIndex: 0,
      OR: [{ isDeleted: false }, { isDeleted: true }],
    });
    await expect(
      f.service.create({ ...input(), parentRequestId: 'other' }),
    ).rejects.toThrow('request_payload_conflict');
    await expect(
      f.service.create({ ...input(), actorId: 'admin' }),
    ).rejects.toThrow('request_payload_conflict');
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: { ...current, isDeleted: true },
      isDeleted: true,
    });
    await expect(f.service.create(input())).rejects.toThrow('receipt_deleted');
    expect(f.tx.brandedGenerationReceipt.create).not.toHaveBeenCalled();
    expect(f.tx.brandedGenerationReceiptEvent.create).not.toHaveBeenCalled();
    expect(f.prompts.persist).not.toHaveBeenCalled();
  });
  it('records null-identity typed failure without a compiled hash or consumed attempt', async () => {
    const f = fixture();
    const current = await saved(f);
    const result = await f.service.recordResolution(
      actor,
      current.id,
      { operationKey: 'resolve', expectedRevision: 0 },
      blockedResolution(),
    );
    expect(result.receipt).toMatchObject({
      state: 'blocked',
      revision: 1,
      snapshot: null,
      prompts: { compiled: null },
      execution: null,
      budget: { generationAttemptsUsed: 0 },
    });
    expect(result.receipt.prompts.original).toEqual(current.prompts.original);
    expect(
      f.tx.brandedGenerationReceipt.update.mock.calls[0][0].where,
    ).toMatchObject({
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
    });
  });
  it('mutation replay precedes revision conflict and returns immutable prior outcome', async () => {
    const f = fixture();
    const current = await saved(f);
    const first = await f.service.cancel(actor, current.id, {
      operationKey: 'cancel',
      expectedRevision: 0,
    });
    const event =
      f.tx.brandedGenerationReceiptEvent.create.mock.calls.at(-1)?.[0].data;
    if (!event) throw new Error('Missing event fixture');
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: { ...first.receipt, revision: 2 },
      isDeleted: false,
    });
    f.tx.brandedGenerationReceiptEvent.findFirst.mockResolvedValue(event);
    f.tx.brandedGenerationReceipt.update.mockClear();
    expect(
      await f.service.cancel(actor, current.id, {
        operationKey: 'cancel',
        expectedRevision: 0,
      }),
    ).toEqual({ receipt: first.receipt, replayed: true });
    expect(f.tx.brandedGenerationReceipt.update).not.toHaveBeenCalled();
    await expect(
      f.service.softDelete(actor, current.id, {
        operationKey: 'cancel',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('request_payload_conflict');
  });
  it('rejects stale revisions, reserved keys and disallowed state transitions', async () => {
    const f = fixture();
    const current = await saved(f);
    await expect(
      f.service.cancel(actor, current.id, {
        operationKey: 'cancel',
        expectedRevision: 1,
      }),
    ).rejects.toThrow('receipt_version_conflict');
    await expect(
      f.service.cancel(actor, current.id, {
        operationKey: 'create',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_operation_reserved');
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: { ...current, state: 'cancelled' },
      isDeleted: false,
    });
    await expect(
      f.service.cancel(actor, current.id, {
        operationKey: 'cancel',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_state_conflict');
  });
  it('tombstones all history, erases prompts and permits only exact authorized delete replay', async () => {
    const f = fixture();
    const current = await saved(f);
    const deleted = await f.service.softDelete(actor, current.id, {
      operationKey: 'delete',
      expectedRevision: 0,
    });
    expect(f.tx.brandedGenerationReceiptEvent.findFirst).toHaveBeenCalledTimes(
      1,
    );
    expect(
      f.tx.brandedGenerationReceiptEvent.findFirst.mock.calls[0][0].where,
    ).toEqual({
      receiptId: current.id,
      organizationId: 'org',
      brandId: 'brand',
      operationKey: 'delete',
      isDeleted: false,
    });
    expect(deleted.receipt.isDeleted).toBe(true);
    expect(deleted.receipt.budget).toEqual(current.budget);
    expect(f.prompts.purge).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      current.id,
    );
    const event =
      f.tx.brandedGenerationReceiptEvent.create.mock.calls.at(-1)?.[0].data;
    if (!event) throw new Error('Missing deletion event');
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: deleted.receipt,
      isDeleted: true,
    });
    f.tx.brandedGenerationReceiptEvent.findFirst.mockResolvedValue(event);
    f.tx.brandedGenerationReceiptEvent.findFirst.mockClear();
    expect(
      await f.service.softDelete(actor, current.id, {
        operationKey: 'delete',
        expectedRevision: 0,
      }),
    ).toEqual({ receipt: deleted.receipt, replayed: true });
    expect(
      f.tx.brandedGenerationReceipt.findFirst.mock.calls.at(-1)?.[0].where,
    ).toEqual({
      id: current.id,
      organizationId: 'org',
      brandId: 'brand',
      OR: [{ isDeleted: false }, { isDeleted: true }],
    });
    expect(f.tx.brandedGenerationReceiptEvent.findFirst).toHaveBeenCalledTimes(
      1,
    );
    expect(
      f.tx.brandedGenerationReceiptEvent.findFirst.mock.calls[0][0].where,
    ).toEqual({
      receiptId: current.id,
      organizationId: 'org',
      brandId: 'brand',
      operationKey: 'delete',
      OR: [{ isDeleted: false }, { isDeleted: true }],
    });
    f.tx.brandedGenerationReceiptEvent.findFirst.mockClear();
    f.tx.brandedGenerationReceiptEvent.findFirst.mockResolvedValueOnce(null);
    await expect(
      f.service.softDelete(actor, current.id, {
        operationKey: 'different',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_deleted');
    expect(f.tx.brandedGenerationReceiptEvent.findFirst).toHaveBeenCalledTimes(
      1,
    );
    f.tx.brandedGenerationReceiptEvent.findFirst.mockClear();
    await expect(
      f.service.softDelete({ ...actor, actorId: 'other' }, current.id, {
        operationKey: 'delete',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_access_denied');
    expect(f.tx.brandedGenerationReceiptEvent.findFirst).not.toHaveBeenCalled();
    vi.mocked(f.access.assertBrand).mockResolvedValue({ isOwnerOrAdmin: true });
    await expect(
      f.service.softDelete({ ...actor, actorId: 'admin' }, current.id, {
        operationKey: 'delete',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_deleted');
    expect(f.tx.brandedGenerationReceiptEvent.findFirst).toHaveBeenCalledTimes(
      1,
    );
    await expect(
      f.service.cancel(actor, current.id, {
        operationKey: 'delete',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_deleted');
  });
  it('reauthorizes creator/admin operations and prompt access on every call', async () => {
    const f = fixture();
    const current = await saved(f);
    f.tx.brandedGenerationReceiptEvent.findFirst.mockClear();
    await expect(
      f.service.cancel({ ...actor, actorId: 'other' }, current.id, {
        operationKey: 'cancel',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_access_denied');
    expect(f.tx.brandedGenerationReceiptEvent.findFirst).not.toHaveBeenCalled();
    await expect(
      f.service.readPrompt(
        { ...actor, actorId: 'other' },
        current.id,
        'original',
      ),
    ).rejects.toThrow('receipt_access_denied');
    vi.mocked(f.access.assertBrand).mockResolvedValue({ isOwnerOrAdmin: true });
    expect(
      (
        await f.service.cancel({ ...actor, actorId: 'admin' }, current.id, {
          operationKey: 'cancel',
          expectedRevision: 0,
        })
      ).receipt.actorId,
    ).toBe('user');
  });
  it('paginates canonical scoped history and validates counters/cursors', async () => {
    const f = fixture();
    const current = await saved(f);
    f.tx.brandedGenerationReceipt.findMany.mockResolvedValue([
      { projection: current },
      { projection: current },
    ]);
    const page = await f.service.list(actor, { limit: 1 });
    expect(f.tx.brandedGenerationReceipt.findMany.mock.calls[0][0]).toEqual({
      where: { organizationId: 'org', brandId: 'brand', isDeleted: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    await f.service.list(actor, {
      limit: 1,
      cursor: page.nextCursor ?? undefined,
    });
    expect(
      f.tx.brandedGenerationReceipt.findMany.mock.calls.at(-1)?.[0],
    ).toEqual({
      where: {
        organizationId: 'org',
        brandId: 'brand',
        isDeleted: false,
        OR: [
          { createdAt: { lt: new Date(current.createdAt) } },
          { createdAt: new Date(current.createdAt), id: { lt: current.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
    });
    f.tx.brandedGenerationReceiptEvent.findMany.mockResolvedValue([
      { projection: current },
      { projection: { ...current, revision: 1 } },
    ]);
    expect(await f.service.history(actor, current.id, { limit: 1 })).toEqual({
      items: [current],
      nextAfterRevision: 0,
    });
    await expect(f.service.list(actor, { limit: 101 })).rejects.toThrow(
      'receipt_limit_out_of_range',
    );
    await expect(
      f.service.list(actor, { limit: 1, cursor: 'bad' }),
    ).rejects.toThrow('receipt_cursor_invalid');
    await expect(
      f.service.create({ ...input(), candidateIndex: 2147483648 }),
    ).rejects.toThrow('receipt_counter_out_of_range');
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: { bad: true },
      isDeleted: false,
    });
    await expect(f.service.get(actor, current.id)).rejects.toThrow(
      'receipt_integrity_failed',
    );
  });
});

it('retains explicit empty enhanced/compiled prompts and carries original forward', async () => {
  const f = fixture();
  const current = await saved(f);
  const base = blockedResolution();
  const resolution: BrandedGenerationResolutionV1 = {
    schemaVersion: 1,
    mode: 'raw',
    status: 'resolved',
    snapshot: null,
    layers: [],
    learning: base.learning,
    diagnostics: [],
    compiledPrompt: '',
    originalPromptHash: current.prompts.original.contentHash,
  };
  const result = await f.service.recordResolution(
    actor,
    current.id,
    { operationKey: 'resolve-empty', expectedRevision: 0 },
    resolution,
    '',
  );
  expect(result.receipt.state).toBe('resolved');
  expect(result.receipt.prompts.enhanced?.contentHash).toBe(
    hashBrandedGenerationTextV1(''),
  );
  expect(result.receipt.prompts.compiled?.contentHash).toBe(
    hashBrandedGenerationTextV1(''),
  );
  expect(result.receipt.prompts.original).toEqual(current.prompts.original);
  expect(f.prompts.persist).toHaveBeenCalledWith(
    expect.anything(),
    actor,
    current.id,
    1,
    'enhanced',
    expect.anything(),
  );
});
it('encryption unavailable blocks resolution without consuming an attempt or fabricating compiled retention', async () => {
  const f = fixture();
  const current = await saved(f);
  vi.mocked(f.prompts.prepare).mockImplementation((text) => ({
    reference: {
      retention: 'unavailable',
      reasonCode: 'prompt_snapshot_unavailable',
      contentHash: hashBrandedGenerationTextV1(text),
    },
    record: null,
  }));
  const base = blockedResolution();
  const resolution: BrandedGenerationResolutionV1 = {
    schemaVersion: 1,
    mode: 'raw',
    status: 'resolved',
    snapshot: null,
    layers: [],
    learning: base.learning,
    diagnostics: [],
    compiledPrompt: 'actual',
    originalPromptHash: current.prompts.original.contentHash,
  };
  const result = await f.service.recordResolution(
    actor,
    current.id,
    { operationKey: 'resolve-unavailable', expectedRevision: 0 },
    resolution,
  );
  expect(result.receipt).toMatchObject({
    state: 'blocked',
    execution: null,
    budget: { generationAttemptsUsed: 0 },
    prompts: { compiled: { retention: 'unavailable' } },
    compliance: 'not_claimed',
  });
  expect(result.receipt.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'prompt_snapshot_unavailable' }),
  );
});

describe('bounded diagnostic retention and cursor allocation', () => {
  it.each(['info', 'warning', 'error'] as const)(
    'discloses deterministic omission of last %s at 128 diagnostics',
    async (severity) => {
      const f = fixture();
      const current = await saved(f);
      const diagnostics = Array.from({ length: 128 }, (_, index) => ({
        code: `diagnostic_${index}`,
        severity: index === 37 || index === 93 ? severity : ('error' as const),
        message: `private message ${index}`,
        ruleId: 'rule',
        evidenceIds: ['evidence'],
      }));
      const resolution: BrandedGenerationResolutionV1 = {
        schemaVersion: 1,
        mode: 'raw',
        status: 'resolved',
        snapshot: null,
        layers: [],
        learning: blockedResolution().learning,
        diagnostics,
        compiledPrompt: 'compiled',
        originalPromptHash: current.prompts.original.contentHash,
      };
      const before = structuredClone(resolution);
      vi.mocked(f.prompts.prepare).mockReturnValue({
        reference: {
          retention: 'unavailable',
          reasonCode: 'prompt_snapshot_unavailable',
          contentHash: hashBrandedGenerationTextV1('compiled'),
        },
        record: null,
      });
      const result = await f.service.recordResolution(
        actor,
        current.id,
        { operationKey: 'bounded', expectedRevision: 0 },
        resolution,
      );
      const index = severity === 'error' ? 127 : 93;
      const omitted = diagnostics[index];
      const digest = hashBrandedGenerationTextV1(
        canonicalizeBrandedGenerationJsonV1(omitted),
      );
      expect(result.receipt.diagnostics).toEqual([
        ...diagnostics.filter((_, position) => position !== index),
        {
          code: 'prompt_snapshot_unavailable',
          severity: 'error',
          message: `Prompt retention unavailable. One prior diagnostic was omitted: ${omitted.code} (${omitted.severity}); diagnostic hash ${digest}.`,
        },
      ]);
      expect(result.receipt.state).toBe('blocked');
      expect(result.receipt.resolutionHash).toBe(
        hashBrandedGenerationResolutionV1(resolution),
      );
      expect(result.receipt.budget).toEqual(current.budget);
      expect(resolution).toEqual(before);
    },
  );
  it.each([127, 128])(
    'replaces existing retention diagnostic without growth at %s',
    async (length) => {
      const f = fixture();
      const current = await saved(f);
      const diagnostics = Array.from({ length }, (_, index) => ({
        code:
          index === 3 ? 'prompt_snapshot_unavailable' : `diagnostic_${index}`,
        severity: 'warning' as const,
        message: 'original',
      }));
      const resolution: BrandedGenerationResolutionV1 = {
        schemaVersion: 1,
        mode: 'raw',
        status: 'resolved',
        snapshot: null,
        layers: [],
        learning: blockedResolution().learning,
        diagnostics,
        compiledPrompt: 'compiled',
        originalPromptHash: current.prompts.original.contentHash,
      };
      vi.mocked(f.prompts.prepare).mockReturnValue({
        reference: {
          retention: 'unavailable',
          reasonCode: 'prompt_snapshot_unavailable',
          contentHash: hashBrandedGenerationTextV1('compiled'),
        },
        record: null,
      });
      const result = await f.service.recordResolution(
        actor,
        current.id,
        { operationKey: 'replace', expectedRevision: 0 },
        resolution,
      );
      expect(result.receipt.diagnostics).toHaveLength(length);
      expect(result.receipt.diagnostics[3]).toEqual({
        code: 'prompt_snapshot_unavailable',
        severity: 'error',
        message: 'Prompt retention unavailable',
      });
      expect(result.receipt.diagnostics[4]).toEqual(diagnostics[4]);
    },
  );
  it.each([
    '',
    'a'.repeat(2113),
    'a',
    'abc=',
    'ab+c',
    'ab/c',
    ' ab',
    Buffer.from([255]).toString('base64url'),
    Buffer.from(
      JSON.stringify({ createdAt: '2026-10-01T17:00:00Z', id: 'id' }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        createdAt: '2026-10-01T17:00:00.000Z',
        id: 'a'.repeat(257),
      }),
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        createdAt: '2026-10-01T17:00:00.000Z',
        id: 'id',
        extra: 1,
      }),
    ).toString('base64url'),
  ])('rejects malformed cursor before any query', async (cursor) => {
    const f = fixture();
    await expect(f.service.list(actor, { limit: 1, cursor })).rejects.toThrow(
      'receipt_cursor_invalid',
    );
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.tx.brandedGenerationReceipt.findMany).not.toHaveBeenCalled();
  });
  it('rejects oversized and nonstring cursors before Buffer.from allocation or coercion', async () => {
    const f = fixture();
    const from = vi.spyOn(Buffer, 'from');
    const coercion = vi.fn();
    try {
      for (const cursor of [
        'a'.repeat(2113),
        { toString: coercion },
      ] as unknown as string[]) {
        await expect(
          f.service.list(actor, { limit: 1, cursor }),
        ).rejects.toThrow('receipt_cursor_invalid');
      }
      expect(from).not.toHaveBeenCalled();
      expect(coercion).not.toHaveBeenCalled();
    } finally {
      from.mockRestore();
    }
  });
  it('roundtrips escaped opaque Unicode and lone-surrogate cursor IDs', async () => {
    const f = fixture();
    const current = await saved(f);
    const id = `${'😀\ud800"\\'.repeat(51)}x`;
    expect(id.length).toBe(256);
    f.tx.brandedGenerationReceipt.findMany.mockResolvedValue([
      { projection: { ...current, id } },
      { projection: current },
    ]);
    const page = await f.service.list(actor, { limit: 1 });
    expect(page.nextCursor).toBe(
      Buffer.from(
        canonicalizeBrandedGenerationJsonV1({
          createdAt: current.createdAt,
          id,
        }),
      ).toString('base64url'),
    );
    await f.service.list(actor, {
      limit: 1,
      cursor: page.nextCursor ?? undefined,
    });
    expect(
      f.tx.brandedGenerationReceipt.findMany.mock.calls.at(-1)?.[0].where.OR[1]
        .id.lt,
    ).toBe(id);
  });
});

it.each([true, false])(
  'preserves retained diagnostics or appends only one below the cap (retained=%s)',
  async (retained) => {
    const f = fixture();
    const current = await saved(f);
    const diagnostics = Array.from(
      { length: retained ? 128 : 127 },
      (_, index) => ({
        code: `diagnostic_${index}`,
        severity: 'info' as const,
        message: 'unchanged',
      }),
    );
    const resolution: BrandedGenerationResolutionV1 = {
      schemaVersion: 1,
      mode: 'raw',
      status: 'resolved',
      snapshot: null,
      layers: [],
      learning: blockedResolution().learning,
      diagnostics,
      compiledPrompt: 'compiled',
      originalPromptHash: current.prompts.original.contentHash,
    };
    if (!retained)
      vi.mocked(f.prompts.prepare).mockReturnValue({
        reference: {
          retention: 'unavailable',
          reasonCode: 'prompt_snapshot_unavailable',
          contentHash: hashBrandedGenerationTextV1('compiled'),
        },
        record: null,
      });
    const mutation = { operationKey: 'bounded-replay', expectedRevision: 0 };
    const result = await f.service.recordResolution(
      actor,
      current.id,
      mutation,
      resolution,
    );
    expect(result.receipt.diagnostics).toEqual(
      retained
        ? diagnostics
        : [
            ...diagnostics,
            {
              code: 'prompt_snapshot_unavailable',
              severity: 'error',
              message: 'Prompt retention unavailable',
            },
          ],
    );
    const event =
      f.tx.brandedGenerationReceiptEvent.create.mock.calls.at(-1)?.[0].data;
    if (!event) throw new Error('Missing event fixture');
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: result.receipt,
      isDeleted: false,
    });
    f.tx.brandedGenerationReceiptEvent.findFirst.mockResolvedValue(event);
    f.tx.brandedGenerationReceipt.update.mockClear();
    f.tx.brandedGenerationReceiptEvent.create.mockClear();
    expect(
      await f.service.recordResolution(actor, current.id, mutation, resolution),
    ).toEqual({ receipt: result.receipt, replayed: true });
    expect(f.tx.brandedGenerationReceipt.update).not.toHaveBeenCalled();
    expect(f.tx.brandedGenerationReceiptEvent.create).not.toHaveBeenCalled();
  },
);
it.each([
  '2026-10-01T17:00:00Z',
  '2026-10-01T17:00:00.0000Z',
  '2026-10-01T17:00:00.000+00:00',
])(
  'does not emit unusable cursor for stored timestamp %s',
  async (createdAt) => {
    const f = fixture();
    const current = await saved(f);
    f.tx.brandedGenerationReceipt.findMany.mockResolvedValue([
      { projection: { ...current, createdAt } },
      { projection: current },
    ]);
    await expect(f.service.list(actor, { limit: 1 })).rejects.toThrow(
      'receipt_integrity_failed',
    );
  },
);
it('rejects noncanonical cursor JSON and controlled IDs before queries', async () => {
  const f = fixture();
  for (const json of [
    '{ "createdAt":"2026-10-01T17:00:00.000Z","id":"id"}',
    '{"id":"id","createdAt":"2026-10-01T17:00:00.000Z"}',
    JSON.stringify({ createdAt: '2026-10-01T17:00:00.000Z', id: 'id\n' }),
    JSON.stringify({ createdAt: '2026-02-30T17:00:00.000Z', id: 'id' }),
  ]) {
    await expect(
      f.service.list(actor, {
        limit: 1,
        cursor: Buffer.from(json).toString('base64url'),
      }),
    ).rejects.toThrow('receipt_cursor_invalid');
  }
  expect(f.prisma.$transaction).not.toHaveBeenCalled();
});

afterEach(() => {
  vi.unstubAllEnvs();
});
function compiledRecipe(): BrandedGenerationCompilerRecipeV1 {
  return ['snapshot-brief-v1', [], [], [], blockedResolution().learning, {}];
}
function compiledResolution(
  value: BrandedGenerationInputV1,
  recipe: BrandedGenerationCompilerRecipeV1,
) {
  return compileSnapshotBriefResolution(
    value,
    null,
    recipe[4],
    recipe[5],
    recipe[1],
    recipe[2],
    recipe[3],
  );
}
describe('compiled resolution reproduction and immutable operation ownership', () => {
  it('uses the exact old operation body and exact additive new body without private projection data', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'retention-unit-secret');
    const f = fixture();
    const current = await saved(f);
    const value = input();
    const recipe = compiledRecipe();
    const resolution = compiledResolution(value, recipe);
    f.tx.brandedGenerationReceiptEvent.create.mockClear();
    const result = await f.service.recordCompiledResolution(
      actor,
      current.id,
      { operationKey: 'compiled', expectedRevision: 0 },
      resolution,
      value,
      recipe,
      'enhanced',
    );
    const event =
      f.tx.brandedGenerationReceiptEvent.create.mock.calls[0][0].data;
    expect(event.operationHash).toBe(
      hashBrandedGenerationOperationV1('resolve', {
        resolutionHash: hashBrandedGenerationResolutionV1(resolution),
        enhancedPromptHash: hashBrandedGenerationTextV1('enhanced'),
        compilerRecipeHash: hashBrandedGenerationOperationV1('recompose', {
          compilerRecipe: JSON.parse(
            encodeBrandedGenerationCompilerRecipeV1(recipe),
          ),
        }),
        retainedInputHash: hashBrandedGenerationOperationV1('recompose', {
          retainedInput: JSON.parse(JSON.stringify(value)),
        }),
      }),
    );
    expect(result.receipt.state).toBe('resolved');
    expect(result.receipt.budget.generationAttemptsUsed).toBe(0);
    for (const projection of [result.receipt, event.projection]) {
      expect(projection).not.toHaveProperty('retainedInput');
      expect(projection).not.toHaveProperty('compilerRecipe');
      expect(JSON.stringify(projection)).not.toContain('Exact 😀');
    }
    const old = fixture();
    const prior = await saved(old);
    old.tx.brandedGenerationReceiptEvent.create.mockClear();
    await old.service.recordResolution(
      actor,
      prior.id,
      { operationKey: 'old', expectedRevision: 0 },
      resolution,
      'enhanced',
    );
    expect(
      old.tx.brandedGenerationReceiptEvent.create.mock.calls[0][0].data
        .operationHash,
    ).toBe(
      hashBrandedGenerationOperationV1('resolve', {
        resolutionHash: hashBrandedGenerationResolutionV1(resolution),
        enhancedPromptHash: hashBrandedGenerationTextV1('enhanced'),
      }),
    );
  });
  it('replays the same key but rejects changed hidden recipe bytes even with identical compiled output', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'retention-unit-secret');
    const f = fixture();
    const current = await saved(f);
    const value = input();
    const recipe = compiledRecipe();
    const resolution = compiledResolution(value, recipe);
    const mutation = { operationKey: 'compiled', expectedRevision: 0 };
    const result = await f.service.recordCompiledResolution(
      actor,
      current.id,
      mutation,
      resolution,
      value,
      recipe,
    );
    const event =
      f.tx.brandedGenerationReceiptEvent.create.mock.calls.at(-1)?.[0].data;
    if (!event) throw new Error('Missing event');
    f.tx.brandedGenerationReceiptEvent.findFirst.mockResolvedValue(event);
    vi.mocked(f.prompts.persist).mockClear();
    f.tx.brandedGenerationReceipt.update.mockClear();
    expect(
      await f.service.recordCompiledResolution(
        actor,
        current.id,
        mutation,
        resolution,
        value,
        recipe,
      ),
    ).toEqual({ receipt: result.receipt, replayed: true });
    const hiddenStages: BrandedGenerationCompilerRecipeV1[2] = [
      [
        {
          kind: 'pack',
          id: 'unused-pack',
          version: 'v1',
          status: 'not_applicable',
          evidenceIds: [],
          omittedIds: [],
        },
        [
          {
            header: 'hidden',
            content: 'unused bytes',
            untrusted: false,
            isAtomic: true,
          },
        ],
        [[]],
      ],
    ];
    const changed: BrandedGenerationCompilerRecipeV1 = [
      recipe[0],
      recipe[1],
      hiddenStages,
      recipe[3],
      recipe[4],
      recipe[5],
    ];
    expect(compiledResolution(value, changed)).toEqual(resolution);
    await expect(
      f.service.recordCompiledResolution(
        actor,
        current.id,
        mutation,
        resolution,
        value,
        changed,
      ),
    ).rejects.toThrow('request_payload_conflict');
    expect(f.prompts.persist).not.toHaveBeenCalled();
    expect(f.tx.brandedGenerationReceipt.update).not.toHaveBeenCalled();
  });
  it('binds full retained input ordering even when request hashing treats knowledge IDs as a set', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'retention-unit-secret');
    const f = fixture();
    const value = { ...input(), knowledgeSourceIds: ['source-a', 'source-b'] };
    const current = (await f.service.create(value)).receipt;
    f.tx.brandedGenerationReceipt.findFirst.mockResolvedValue({
      projection: current,
      isDeleted: false,
    });
    const recipe = compiledRecipe();
    const resolution = compiledResolution(value, recipe);
    const mutation = { operationKey: 'compiled-order', expectedRevision: 0 };
    await f.service.recordCompiledResolution(
      actor,
      current.id,
      mutation,
      resolution,
      value,
      recipe,
    );
    const event =
      f.tx.brandedGenerationReceiptEvent.create.mock.calls.at(-1)?.[0].data;
    if (!event) throw new Error('Missing ordered event');
    f.tx.brandedGenerationReceiptEvent.findFirst.mockResolvedValue(event);
    const reordered = {
      ...value,
      knowledgeSourceIds: ['source-b', 'source-a'],
    };
    expect(hashBrandedGenerationRequestV1(reordered)).toBe(current.requestHash);
    expect(compiledResolution(reordered, recipe)).toEqual(resolution);
    vi.mocked(f.prompts.persist).mockClear();
    await expect(
      f.service.recordCompiledResolution(
        actor,
        current.id,
        mutation,
        resolution,
        reordered,
        recipe,
      ),
    ).rejects.toThrow('request_payload_conflict');
    expect(f.prompts.persist).not.toHaveBeenCalled();
  });
  it.each([
    'actorId',
    'organizationId',
    'brandId',
    'requestKey',
    'candidateIndex',
    'parentRequestId',
    'runId',
    'workflowExecutionId',
    'generationId',
  ] as const)('rejects retained %s binding before writes', async (field) => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'retention-unit-secret');
    const f = fixture();
    const current = await saved(f);
    const value = input();
    const changed = {
      ...value,
      [field]: field === 'candidateIndex' ? 1 : 'other',
    };
    const recipe = compiledRecipe();
    const resolution = compiledResolution(changed, recipe);
    vi.mocked(f.prompts.persist).mockClear();
    f.tx.brandedGenerationReceipt.update.mockClear();
    f.tx.brandedGenerationReceiptEvent.create.mockClear();
    await expect(
      f.service.recordCompiledResolution(
        actor,
        current.id,
        { operationKey: 'compiled', expectedRevision: 0 },
        resolution,
        changed,
        recipe,
      ),
    ).rejects.toThrow('request_payload_conflict');
    expect(f.prompts.persist).not.toHaveBeenCalled();
    expect(f.tx.brandedGenerationReceipt.update).not.toHaveBeenCalled();
    expect(f.tx.brandedGenerationReceiptEvent.create).not.toHaveBeenCalled();
  });
  it('preserves original actor on admin persistence and rejects mismatched reproduction outside transaction', async () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', 'retention-unit-secret');
    const f = fixture();
    const current = await saved(f);
    const value = input();
    const recipe = compiledRecipe();
    const resolution = compiledResolution(value, recipe);
    vi.mocked(f.access.assertBrand).mockResolvedValue({ isOwnerOrAdmin: true });
    vi.mocked(f.prompts.persist).mockClear();
    await f.service.recordCompiledResolution(
      { ...actor, actorId: 'admin' },
      current.id,
      { operationKey: 'compiled', expectedRevision: 0 },
      resolution,
      value,
      recipe,
    );
    expect(f.prompts.persist).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      current.id,
      1,
      'compiled',
      expect.objectContaining({
        record: expect.objectContaining({
          format: 'genfeed.branded-generation-compiled.v1',
        }),
      }),
    );
    f.prisma.$transaction.mockClear();
    if (resolution.status !== 'resolved')
      throw new Error('Expected actual compiled fixture');
    await expect(
      f.service.recordCompiledResolution(
        actor,
        current.id,
        { operationKey: 'bad', expectedRevision: 0 },
        { ...resolution, compiledPrompt: `${resolution.compiledPrompt}bad` },
        value,
        recipe,
      ),
    ).rejects.toThrow('compiler_recipe_mismatch');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects retained accessors before encryption and rejects blocked values', async () => {
    const f = fixture();
    const current = await saved(f);
    const value = input();
    const recipe = compiledRecipe();
    const resolution = compiledResolution(value, recipe);
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    const getter = vi.fn(() => 'model');
    Object.defineProperty(value, 'model', { enumerable: true, get: getter });
    f.prisma.$transaction.mockClear();
    await expect(
      f.service.recordCompiledResolution(
        actor,
        current.id,
        { operationKey: 'bad', expectedRevision: 0 },
        resolution,
        value,
        recipe,
      ),
    ).rejects.toThrow('compiler_recipe_invalid');
    expect(getter).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    await expect(
      f.service.recordCompiledResolution(
        actor,
        current.id,
        { operationKey: 'blocked', expectedRevision: 0 },
        blockedResolution(),
        input(),
        recipe,
      ),
    ).rejects.toThrow('compiler_recipe_invalid');
  });
  it('retains a bounded omission diagnostic with exact hashes and no attempt on crypto failure', async () => {
    const f = fixture();
    const current = await saved(f);
    const value = input();
    const recipe = compiledRecipe();
    const diagnostics: BrandedGenerationCompilerRecipeV1[3] = Array.from(
      { length: 128 },
      (_, index) => ({
        code: `diagnostic_${index}`,
        severity: 'warning',
        message: `Diagnostic ${index}`,
        evidenceIds: [],
      }),
    );
    const boundedRecipe: BrandedGenerationCompilerRecipeV1 = [
      recipe[0],
      recipe[1],
      recipe[2],
      diagnostics,
      recipe[4],
      recipe[5],
    ];
    const resolution = compiledResolution(value, boundedRecipe);
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '');
    const result = await f.service.recordCompiledResolution(
      actor,
      current.id,
      { operationKey: 'compiled', expectedRevision: 0 },
      resolution,
      value,
      boundedRecipe,
    );
    expect(result.receipt.state).toBe('blocked');
    expect(result.receipt.diagnostics).toHaveLength(128);
    expect(result.receipt.diagnostics.at(-1)?.message).toContain(
      'diagnostic_127 (warning)',
    );
    expect(result.receipt.resolutionHash).toBe(
      hashBrandedGenerationResolutionV1(resolution),
    );
    expect(result.receipt.budget).toEqual(current.budget);
    expect(result.receipt.costs).toEqual([]);
  });
});
