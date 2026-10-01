import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

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
      projection: result.receipt,
    });
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
    expect(
      await f.service.softDelete(actor, current.id, {
        operationKey: 'delete',
        expectedRevision: 0,
      }),
    ).toEqual({ receipt: deleted.receipt, replayed: true });
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
    await expect(
      f.service.cancel({ ...actor, actorId: 'other' }, current.id, {
        operationKey: 'cancel',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('receipt_access_denied');
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
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    await f.service.list(actor, {
      limit: 1,
      cursor: page.nextCursor ?? undefined,
    });
    expect(
      f.tx.brandedGenerationReceipt.findMany.mock.calls.at(-1)?.[0].where,
    ).toMatchObject({
      organizationId: 'org',
      brandId: 'brand',
      isDeleted: false,
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
