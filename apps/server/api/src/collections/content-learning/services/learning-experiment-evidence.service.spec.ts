import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import { LearningExperimentEvidenceService } from '@api/collections/content-learning/services/learning-experiment-evidence.service';
import { learningHash } from '@api/collections/content-learning/services/learning-operation.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LearningDependencyKindV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type {
  ContentLearningExperimentEvent,
  ContentLearningOpportunity,
  LlmVendorCost,
  Prisma,
} from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
function fixture() {
  const input: Parameters<LearningExperimentEvidenceService['append']>[0] = {
    organizationId: 'org',
    opportunityId: 'opportunity',
    eventKey: 'artifact-event',
    sourceKind: 'post',
    sourceId: 'post',
    sourceRevision: '2',
    occurredAt: new Date('2026-10-01'),
    payload: {
      kind: 'artifact',
      artifactHash: 'artifact',
      ingredientVersions: [],
      textNonempty: true,
      generationClosed: true,
    },
  };
  const opportunity: Pick<
    ContentLearningOpportunity,
    | 'id'
    | 'experimentId'
    | 'enrollmentId'
    | 'organizationId'
    | 'brandId'
    | 'credentialId'
  > = {
    id: 'opportunity',
    experimentId: 'experiment',
    enrollmentId: 'enrollment',
    organizationId: 'org',
    brandId: 'brand',
    credentialId: 'credential',
  };
  const original: Pick<ContentLearningExperimentEvent, 'id' | 'fingerprint'> = {
    id: 'original',
    fingerprint: 'old-fingerprint',
  };
  const ledger: Pick<
    LlmVendorCost,
    'id' | 'vendorCostMicros' | 'costEvidence' | 'updatedAt'
  > = {
    id: 'ledger',
    vendorCostMicros: 100,
    costEvidence: 'observed',
    updatedAt: new Date('2026-10-01'),
  };
  const attempts: Array<
    Pick<ContentLearningExperimentEvent, 'id' | 'opportunityId'>
  > = [{ id: 'attempt-event', opportunityId: 'opportunity' }];
  let latest: Pick<
    ContentLearningExperimentEvent,
    'id' | 'fingerprint'
  > | null = null;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    contentLearningOpportunity: {
      findFirst: vi
        .fn()
        .mockImplementation((): typeof opportunity | null => opportunity),
    },
    contentLearningExperimentEvent: {
      findFirst: vi
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: Prisma.ContentLearningExperimentEventWhereInput;
          }) => (where.id === original.id ? original : latest),
        ),
      create: vi
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: Prisma.ContentLearningExperimentEventUncheckedCreateInput;
          }) => {
            latest = { id: 'event', fingerprint: data.fingerprint };
            return { ...data, ...latest };
          },
        ),
    },
  };
  const root = {
    $transaction: vi
      .fn()
      .mockImplementation((apply: (client: typeof tx) => Promise<unknown>) =>
        apply(tx),
      ),
    contentLearningOpportunity: { findFirst: vi.fn() },
    contentLearningExperimentEvent: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue(attempts),
    },
    llmVendorCost: { findFirst: vi.fn().mockImplementation(() => ledger) },
    mediaVendorCost: { findFirst: vi.fn().mockImplementation(() => ledger) },
  };
  const dependencies = {
    invalidate: vi.fn(),
    link: vi.fn(),
    resolve: vi
      .fn()
      .mockImplementation(
        (
          kind: LearningDependencyKindV1,
          id: string,
          organizationId: string | null,
          _client: Prisma.TransactionClient,
        ) => ({ kind, id, organizationId, version: '1' }),
      ),
  };
  const service = new LearningExperimentEvidenceService(
    root as unknown as PrismaService,
    dependencies as unknown as LearningDependencyService,
  );
  function assertEntry(mode: 'shared' | 'exclusive' = 'shared') {
    expect(root.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain(
      mode === 'shared'
        ? 'pg_advisory_xact_lock_shared(5728, 1)'
        : 'pg_advisory_xact_lock(5728, 1)',
    );
    for (const mock of [
      tx.contentLearningOpportunity.findFirst,
      tx.contentLearningExperimentEvent.findFirst,
      tx.contentLearningExperimentEvent.create,
    ])
      if (mock.mock.invocationCallOrder.length)
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          mock.mock.invocationCallOrder[0],
        );
    expect(root.contentLearningOpportunity.findFirst).not.toHaveBeenCalled();
    expect(
      root.contentLearningExperimentEvent.findFirst,
    ).not.toHaveBeenCalled();
  }
  return {
    service,
    input,
    opportunity,
    original,
    ledger,
    attempts,
    root,
    tx,
    dependencies,
    assertEntry,
    setPrior(row: typeof original) {
      latest = row;
    },
  };
}
describe('same-client fenced experiment evidence append', () => {
  it('appends typed ordinary artifact evidence after shared opportunity scope read with exact fields/hash/source links', async () => {
    const f = fixture();
    const event = await f.service.append(f.input);
    expect(event).toMatchObject({
      experimentId: 'experiment',
      opportunityId: 'opportunity',
      enrollmentId: 'enrollment',
      organizationId: 'org',
      brandId: 'brand',
      credentialId: 'credential',
      eventKey: f.input.eventKey,
      kind: 'artifact',
      payload: f.input.payload,
      occurredAt: f.input.occurredAt,
      observedAt: expect.any(Date),
      fingerprint: learningHash([
        f.input.eventKey,
        f.input.sourceKind,
        f.input.sourceId,
        f.input.sourceRevision,
        f.input.occurredAt.toISOString(),
        f.input.payload,
      ]),
    });
    expect(f.tx.contentLearningOpportunity.findFirst).toHaveBeenCalledWith({
      where: { id: 'opportunity', organizationId: 'org', isDeleted: false },
    });
    expect(f.tx.contentLearningExperimentEvent.findFirst).toHaveBeenCalledWith({
      where: {
        experimentId: 'experiment',
        organizationId: 'org',
        eventKey: f.input.eventKey,
        isDeleted: false,
      },
    });
    expect(f.dependencies.resolve).toHaveBeenNthCalledWith(
      1,
      'post',
      'post',
      'org',
      f.tx,
    );
    expect(f.dependencies.resolve).toHaveBeenNthCalledWith(
      2,
      'experiment-event',
      'event',
      'org',
      f.tx,
    );
    expect(f.dependencies.link).toHaveBeenCalledWith(
      f.tx,
      { kind: 'post', id: 'post', organizationId: 'org', version: '1' },
      {
        kind: 'experiment-event',
        id: 'event',
        organizationId: 'org',
        version: '1',
      },
    );
    expect(f.dependencies.invalidate).not.toHaveBeenCalled();
    f.assertEntry();
  });
  it('corrects under exclusive fence with exact scoped original invalidation before creation', async () => {
    const f = fixture();
    f.input.supersedesId = 'original';
    expect(await f.service.append(f.input)).toMatchObject({
      supersedesId: 'original',
    });
    expect(
      f.tx.contentLearningExperimentEvent.findFirst,
    ).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'original',
        organizationId: 'org',
        opportunityId: 'opportunity',
        isDeleted: false,
      },
    });
    expect(f.dependencies.invalidate).toHaveBeenCalledWith(
      'experiment-event',
      'original',
      f.tx,
      'org',
    );
    expect(f.dependencies.invalidate).toHaveBeenCalledTimes(1);
    expect(f.dependencies.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.contentLearningExperimentEvent.create.mock.invocationCallOrder[0],
    );
    f.assertEntry('exclusive');
  });
  it('rejects missing correction original without invalidation or create after exclusive entry', async () => {
    const f = fixture();
    f.input.supersedesId = 'missing';
    await expect(f.service.append(f.input)).rejects.toThrow(
      'Correction scope mismatch',
    );
    expect(f.dependencies.invalidate).not.toHaveBeenCalled();
    expect(f.tx.contentLearningExperimentEvent.create).not.toHaveBeenCalled();
    f.assertEntry('exclusive');
  });
  it.each(['same', 'changed'])(
    'keeps correction %s fingerprint replay before original lookup/invalidation',
    async (kind) => {
      const f = fixture();
      f.input.supersedesId = 'original';
      const prior = {
        id: 'previous',
        fingerprint:
          kind === 'same'
            ? learningHash([
                f.input.eventKey,
                f.input.sourceKind,
                f.input.sourceId,
                f.input.sourceRevision,
                f.input.occurredAt.toISOString(),
                f.input.payload,
              ])
            : 'changed-fingerprint',
      };
      f.setPrior(prior);
      const result = f.service.append(f.input);
      if (kind === 'same') expect(await result).toBe(prior);
      else
        await expect(result).rejects.toThrow(
          'Immutable event key payload conflict',
        );
      expect(
        f.tx.contentLearningExperimentEvent.findFirst,
      ).toHaveBeenCalledTimes(1);
      for (const mock of [
        f.dependencies.invalidate,
        f.dependencies.resolve,
        f.dependencies.link,
        f.tx.contentLearningExperimentEvent.create,
      ])
        expect(mock).not.toHaveBeenCalled();
      f.assertEntry('exclusive');
    },
  );
  it.each(['opportunity', 'fence'])(
    'propagates missing/failed %s before event/dependency work',
    async (kind) => {
      const f = fixture(),
        failure = new Error('fence failed');
      if (kind === 'opportunity')
        f.tx.contentLearningOpportunity.findFirst.mockResolvedValue(null);
      else f.tx.$queryRaw.mockRejectedValue(failure);
      const result = f.service.append(f.input);
      if (kind === 'opportunity')
        await expect(result).rejects.toThrow('Opportunity scope mismatch');
      else {
        await expect(result).rejects.toBe(failure);
        expect(
          f.tx.contentLearningOpportunity.findFirst,
        ).not.toHaveBeenCalled();
      }
      for (const mock of [
        f.tx.contentLearningExperimentEvent.findFirst,
        f.tx.contentLearningExperimentEvent.create,
        f.dependencies.invalidate,
        f.dependencies.resolve,
        f.dependencies.link,
      ])
        expect(mock).not.toHaveBeenCalled();
      f.assertEntry();
    },
  );
  it.each(['llm-ledger', 'media-ledger', 'config', 'invalid-kind'])(
    'preserves dependency source mapping/global scope and invalid-kind timing for %s',
    async (kind) => {
      const f = fixture();
      f.input.sourceKind = kind;
      const result = f.service.append(f.input);
      if (kind === 'invalid-kind') {
        await expect(result).rejects.toThrow('Invalid dependency identity');
        expect(
          f.tx.contentLearningExperimentEvent.create,
        ).toHaveBeenCalledTimes(1);
        expect(f.dependencies.resolve).not.toHaveBeenCalled();
        expect(f.dependencies.link).not.toHaveBeenCalled();
      } else {
        await result;
        expect(f.dependencies.resolve).toHaveBeenNthCalledWith(
          1,
          kind === 'llm-ledger'
            ? 'llm_vendor_cost'
            : kind === 'media-ledger'
              ? 'media_vendor_cost'
              : 'config',
          'post',
          kind === 'config' ? null : 'org',
          f.tx,
        );
      }
      f.assertEntry();
    },
  );
  it.each([undefined, ''])(
    'retains ordinary shared truthiness for supersedesId=%s',
    async (supersedesId) => {
      const f = fixture();
      await f.service.append({ ...f.input, supersedesId });
      expect(f.dependencies.invalidate).not.toHaveBeenCalled();
      expect(
        f.tx.contentLearningExperimentEvent.findFirst,
      ).toHaveBeenCalledTimes(1);
      f.assertEntry();
    },
  );
  it('records fixed provider attempt through real shared append without a provider call', async () => {
    const f = fixture(),
      startedAt = new Date('2026-10-01');
    expect(
      await f.service.recordCostAttempt({
        organizationId: 'org',
        opportunityIds: ['opportunity'],
        allocationWeights: [1],
        attemptId: 'fixed-attempt',
        startedAt,
        provider: 'provider',
        model: 'model',
      }),
    ).toBe('fixed-attempt');
    expect(f.tx.contentLearningExperimentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventKey: 'cost_attempt:fixed-attempt:opportunity',
          sourceKind: 'provider_attempt',
          sourceId: 'fixed-attempt',
          occurredAt: startedAt,
          payload: expect.objectContaining({
            kind: 'cost_attempt',
            attemptId: 'fixed-attempt',
            opportunityIds: ['opportunity'],
            allocationWeights: [1],
            startedAt: startedAt.toISOString(),
          }),
        }),
      }),
    );
    expect(f.dependencies.resolve).toHaveBeenNthCalledWith(
      1,
      'provider_attempt',
      'fixed-attempt',
      'org',
      f.tx,
    );
    expect(f.root.llmVendorCost.findFirst).not.toHaveBeenCalled();
    f.assertEntry();
  });
  it.each(['observed', 'pending', 'unknown'])(
    'retains root persisted cost %s reads outside individually shared append with null/terminal semantics',
    async (kind) => {
      const f = fixture();
      f.ledger.costEvidence = kind;
      f.ledger.vendorCostMicros =
        kind === 'unknown' ? -1 : kind === 'pending' ? 0 : 100;
      const fingerprint = learningHash([
        f.ledger.id,
        f.ledger.vendorCostMicros,
        kind,
        f.ledger.updatedAt.toISOString(),
      ]);
      expect(
        await f.service.recordCostSettlement({
          organizationId: 'org',
          attemptId: 'fixed-attempt',
          ledgerId: 'ledger',
          ledgerKind: 'llm',
        }),
      ).toBe(fingerprint);
      expect(f.root.llmVendorCost.findFirst).toHaveBeenCalledWith({
        where: { id: 'ledger', organizationId: 'org', isDeleted: false },
      });
      expect(
        f.root.contentLearningExperimentEvent.findMany,
      ).toHaveBeenCalledWith({
        where: {
          organizationId: 'org',
          kind: 'cost_attempt',
          sourceKind: 'provider_attempt',
          sourceId: 'fixed-attempt',
          isDeleted: false,
        },
      });
      expect(
        f.root.llmVendorCost.findFirst.mock.invocationCallOrder[0],
      ).toBeLessThan(f.tx.$queryRaw.mock.invocationCallOrder[0]);
      expect(f.tx.contentLearningExperimentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceId: 'ledger',
            sourceRevision: fingerprint,
            payload: {
              kind: 'cost_settlement',
              attemptId: 'fixed-attempt',
              ledgerId: 'ledger',
              ledgerKind: 'llm',
              ledgerFingerprint: fingerprint,
              vendorCostMicros:
                kind === 'unknown' ? null : f.ledger.vendorCostMicros,
              costEvidence: kind,
              terminal: kind !== 'pending',
            },
          }),
        }),
      );
      f.assertEntry();
    },
  );
});
