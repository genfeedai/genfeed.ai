import { randomUUID } from 'node:crypto';
import { learningCanonicalHash } from '@api/collections/content-learning/services/learning-operation.service';
import {
  learningPilotPolicyLineageValid,
  readCurrentLearningPilotV1,
} from '@api/collections/content-learning/services/learning-pilot-gate.helper';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition !== null && typeof condition === 'object') {
      if ('not' in condition) return value !== condition.not;
      if ('gt' in condition)
        return (
          value instanceof Date &&
          condition.gt instanceof Date &&
          value > condition.gt
        );
      if ('lte' in condition)
        return (
          value instanceof Date &&
          condition.lte instanceof Date &&
          value <= condition.lte
        );
    }
    return value === condition;
  });
}
function fixture() {
  const at = new Date('2026-10-08T12:00:00Z');
  const scope = {
    organizationId: randomUUID(),
    brandId: randomUUID(),
    credentialId: randomUUID(),
    scopeKey: randomUUID(),
    epoch: 2,
  };
  const candidate = {
    ...scope,
    id: randomUUID(),
    version: 3,
    descriptorHash: 'descriptor',
    algorithm: 'ridge-epsilon-v1',
    configVersion: 'config',
    featureSchema: 'numeric-nine-v1',
    synthetic: false,
    isDeleted: false,
  };
  const experiment = {
    ...scope,
    id: randomUUID(),
    cellKey: scope.scopeKey,
    kind: 'private_pilot',
    status: 'sealed',
    sealedAt: at as Date | null,
    synthetic: false,
    isDeleted: false,
    startAt: new Date(at.getTime() - 1),
    endAt: new Date(at.getTime() + 1),
    spec: { schemaVersion: 1 },
    specHash: learningCanonicalHash({ schemaVersion: 1 }),
    candidatePolicyId: candidate.id,
  };
  const enrollment = {
    ...scope,
    id: randomUUID(),
    experimentId: experiment.id,
    accountEpoch: scope.epoch,
    included: true,
    withdrawnAt: null as Date | null,
    isDeleted: false,
  };
  const rows = [experiment];
  const tx = {
    contentLearningExperiment: {
      findMany: vi
        .fn()
        .mockImplementation(
          ({ where, take }: { where: Record<string, unknown>; take: number }) =>
            rows.filter((row) => matches(row, where)).slice(0, take),
        ),
    },
    contentLearningEnrollment: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          matches(enrollment, where) ? enrollment : null,
        ),
    },
    contentLearningPolicyVersion: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
          matches(candidate, where) ? candidate : null,
        ),
    },
  };
  const dependencies = { valid: vi.fn().mockResolvedValue(true) };
  const read = (window: 'assignment' | 'activation' = 'assignment') =>
    readCurrentLearningPilotV1(
      tx as unknown as Prisma.TransactionClient,
      dependencies,
      scope,
      at,
      window,
    );
  return {
    at,
    scope,
    candidate,
    experiment,
    enrollment,
    rows,
    tx,
    dependencies,
    read,
  };
}
describe('current sealed pilot eligibility', () => {
  it('reads one valid pilot and scopes every query to the organization and non-deleted rows', async () => {
    const f = fixture();
    expect(await f.read()).toEqual({
      experiment: f.experiment,
      enrollment: f.enrollment,
      candidate: f.candidate,
    });
    for (const mock of [
      f.tx.contentLearningExperiment.findMany,
      f.tx.contentLearningEnrollment.findFirst,
      f.tx.contentLearningPolicyVersion.findFirst,
    ])
      expect(mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: f.scope.organizationId,
            isDeleted: false,
          }),
        }),
      );
    expect(f.tx.contentLearningExperiment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
    for (const [kind, id] of [
      ['experiment', f.experiment.id],
      ['enrollment', f.enrollment.id],
    ])
      expect(f.dependencies.valid).toHaveBeenCalledWith(
        kind,
        id,
        f.tx,
        f.scope.organizationId,
      );
  });
  it.each([
    'none',
    'two',
    'cancelled',
    'unsealed',
    'expired',
    'future',
    'hash',
    'withdrawn',
    'epoch',
    'experiment dependency',
    'enrollment dependency',
    'other scope',
  ])('rejects %s eligibility', async (reason) => {
    const f = fixture();
    switch (reason) {
      case 'none':
        f.rows.length = 0;
        break;
      case 'two':
        f.rows.push({ ...f.experiment, id: randomUUID() });
        break;
      case 'cancelled':
        f.experiment.status = 'cancelled';
        break;
      case 'unsealed':
        f.experiment.sealedAt = null;
        break;
      case 'expired':
        f.experiment.endAt = f.at;
        break;
      case 'future':
        f.experiment.startAt = new Date(f.at.getTime() + 1);
        break;
      case 'hash':
        f.experiment.specHash = 'mismatch';
        break;
      case 'withdrawn':
        f.enrollment.withdrawnAt = f.at;
        break;
      case 'epoch':
        f.enrollment.accountEpoch++;
        break;
      case 'experiment dependency':
        f.dependencies.valid.mockResolvedValueOnce(false);
        break;
      case 'enrollment dependency':
        f.dependencies.valid
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);
        break;
      case 'other scope':
        f.candidate.scopeKey = randomUUID();
        break;
    }
    expect(await f.read()).toBeNull();
  });
  it('permits activation before assignment starts', async () => {
    const f = fixture();
    f.experiment.startAt = new Date(f.at.getTime() + 1);
    expect(await f.read('assignment')).toBeNull();
    expect(await f.read('activation')).not.toBeNull();
  });
});
describe('adaptive pilot policy lineage', () => {
  it('accepts the candidate and a higher version with the same tuple', () => {
    const { candidate } = fixture();
    expect(learningPilotPolicyLineageValid(candidate, candidate)).toBe(true);
    expect(
      learningPilotPolicyLineageValid(candidate, {
        ...candidate,
        id: randomUUID(),
        version: candidate.version + 1,
      }),
    ).toBe(true);
  });
  it.each([
    'organizationId',
    'brandId',
    'credentialId',
    'scopeKey',
    'descriptorHash',
    'algorithm',
    'configVersion',
    'featureSchema',
  ] as const)('rejects different %s', (key) => {
    const { candidate } = fixture();
    expect(
      learningPilotPolicyLineageValid(candidate, {
        ...candidate,
        id: randomUUID(),
        version: candidate.version + 1,
        [key]: randomUUID(),
      }),
    ).toBe(false);
  });
  it('rejects lower or equal versions, different epochs and synthetic policies', () => {
    const { candidate } = fixture();
    for (const version of [candidate.version - 1, candidate.version])
      expect(
        learningPilotPolicyLineageValid(candidate, {
          ...candidate,
          id: randomUUID(),
          version,
        }),
      ).toBe(false);
    expect(
      learningPilotPolicyLineageValid(candidate, {
        ...candidate,
        id: randomUUID(),
        version: candidate.version + 1,
        epoch: candidate.epoch + 1,
      }),
    ).toBe(false);
    expect(
      learningPilotPolicyLineageValid(candidate, {
        ...candidate,
        synthetic: true,
      }),
    ).toBe(false);
  });
});
