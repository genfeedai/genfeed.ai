import {
  LearningDatasetGraph,
  LearningDatasetService,
  validateLearningRows,
} from '@api/collections/content-learning/services/learning-dataset.service';
import type { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
const row = {
  sourceFingerprint: 'log-sha',
  accountGroup: 'pseudonym',
  decisionAt: '2026-09-01T00:00:00Z',
  measuredAt: '2026-09-03T00:00:00Z',
  features: [1, 0, 1, 0, 1, 0, 1, 0, 1],
  armId: 'baseline-v1',
  probabilities: {
    'baseline-v1': 1,
    'question-example-v1': 0,
    'proof-steps-v1': 0,
  },
  reward: 0.5,
  synthetic: true,
};
const cutoff = new Date('2026-09-30T00:00:00Z');
describe('strict owned numeric import', () => {
  it('preserves immutable synthetic status and observed complete logging probabilities', () =>
    expect(validateLearningRows([row], cutoff)[0]).toEqual(row));
  it('rejects raw prompts, URLs and arbitrary unknown fields', () => {
    for (const extra of [
      { prompt: 'private' },
      { url: 'https://private' },
      { topic: 'private' },
    ])
      expect(() =>
        validateLearningRows([{ ...row, ...extra }], cutoff),
      ).toThrow('Unknown dataset fields');
  });
  it('rejects missing probabilities, unnormalized distributions, wrong feature lengths and immature rows', () => {
    for (const invalid of [
      { ...row, probabilities: {} },
      {
        ...row,
        probabilities: {
          'baseline-v1': 1,
          'question-example-v1': 1,
          'proof-steps-v1': 0,
        },
      },
      { ...row, features: [1] },
      { ...row, measuredAt: '2026-10-01T00:00:00Z' },
    ])
      expect(() => validateLearningRows([invalid], cutoff)).toThrow();
  });
});

describe('immutable dataset operation retries', () => {
  it('returns the original salted manifest and splits and rejects changed payload', async () => {
    let receipt: unknown = null,
      dataset: unknown = null;
    const createDataset = vi.fn().mockImplementation(({ data }) => {
      dataset = { id: 'dataset', ...data };
      return Promise.resolve(dataset);
    });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentLearningOperation: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(receipt)),
        create: vi.fn().mockImplementation(({ data }) => {
          receipt = { id: 'operation', ...data };
          return Promise.resolve(receipt);
        }),
      },
      contentLearningDataset: {
        create: createDataset,
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(dataset)),
      },
      contentLearningDatasetEntry: {
        createMany: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new LearningDatasetService(
      prisma as unknown as PrismaService,
      {} as LearningDependencyService,
    );
    const input = {
      organizationId: 'operator-org',
      actorId: 'actor',
      requestId: 'same',
      rightsStatement: 'Owned synthetic fixture rights',
      profile: 'awareness',
      cell: 'cell',
      cutoff: '2026-09-29T00:00:00Z',
      rows: [row],
    };
    const first = await service.create(input),
      second = await service.create(input);
    expect(second).toEqual(first);
    expect(createDataset).toHaveBeenCalledTimes(1);
    expect(tx.contentLearningDatasetEntry.createMany).toHaveBeenCalledTimes(1);
    await expect(
      service.create({ ...input, rightsStatement: 'Changed rights' }),
    ).rejects.toThrow('payload conflict');
    await expect(
      service.create({ ...input, cell: 'different-cell' }),
    ).rejects.toThrow('payload conflict');
    expect(createDataset).toHaveBeenCalledTimes(1);
  });
});

describe('consented source account identities', () => {
  function service() {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentLearningOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'operation' }),
      },
      contentLearningAccount: { findFirst: vi.fn().mockResolvedValue(null) },
      contentLearningConsent: { findFirst: vi.fn() },
      contentLearningReward: { findMany: vi.fn(), findFirst: vi.fn() },
      contentLearningDecision: { findFirst: vi.fn() },
      contentLearningDataset: { create: vi.fn() },
      contentLearningDatasetEntry: { createMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    };
    return {
      tx,
      service: new LearningDatasetService(
        prisma as unknown as PrismaService,
        {
          valid: vi.fn().mockResolvedValue(true),
          link: vi.fn(),
          resolve: vi.fn(),
        } as unknown as LearningDependencyService,
      ),
    };
  }
  const input = {
    organizationId: 'operator-org',
    actorId: 'actor',
    requestId: 'req',
    rightsStatement: 'Owned synthetic fixture rights',
    profile: 'awareness',
    cell: 'cell',
    cutoff: '2026-09-29T00:00:00Z',
  };
  it('rejects duplicate and bare source account identities', async () => {
    const f = service();
    await expect(
      f.service.create({
        ...input,
        sourceAccounts: [
          { organizationId: 'org', accountId: 'account' },
          { organizationId: 'org', accountId: 'account' },
        ],
      }),
    ).rejects.toThrow('Duplicate source account');
    await expect(
      f.service.create({
        ...input,
        sourceAccounts: [{ organizationId: '', accountId: 'account' } as never],
      }),
    ).rejects.toThrow('Source account identity required');
  });
  it('returns 404 when the account is not in the claimed organization', async () => {
    const f = service();
    await expect(
      f.service.create({
        ...input,
        sourceAccounts: [{ organizationId: 'org', accountId: 'foreign' }],
      }),
    ).rejects.toThrow('Source account not found');
    expect(f.tx.contentLearningAccount.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign',
        organizationId: 'org',
        isDeleted: false,
      },
    });
  });
});

describe('bounded dataset graph validation', () => {
  function graph(
    edges: unknown[],
    limits?: { nodes: number; edges: number; levels: number },
  ) {
    const tx = {
      contentLearningReward: {
        findMany: vi.fn().mockResolvedValue([{ id: 'reward', version: 1 }]),
      },
      contentLearningDependency: {
        findMany: vi
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              edges.filter(
                (edge: { derivedKind: string }) =>
                  edge.derivedKind === where.derivedKind,
              ),
            ),
          ),
      },
    };
    return { tx, graph: new LearningDatasetGraph(tx as never, limits) };
  }
  const root = { kind: 'reward' as const, id: 'reward', organizationId: 'org' };
  const edge = {
    derivedKind: 'reward',
    derivedId: 'reward',
    sourceKind: 'config',
    sourceId: 'numeric-nine-v1',
    sourceVersion: 'numeric-nine-v1',
    sourceOrganizationId: null,
    valid: true,
  };
  it('reads shared ancestors once across pages', async () => {
    const f = graph([edge]);
    await f.graph.load([root]);
    await f.graph.load([root]);
    expect(f.graph.valid(root)).toBe(true);
    expect(f.tx.contentLearningReward.findMany).toHaveBeenCalledTimes(1);
    expect(f.tx.contentLearningDependency.findMany).toHaveBeenCalledTimes(2);
  });
  it.each([
    [],
    [{ ...edge, valid: false }],
    [{ ...edge, sourceKind: 'unknown' }],
    [{ ...edge, sourceVersion: 'current' }],
    [{ ...edge, sourceVersion: 'changed' }],
    [{ ...edge, sourceOrganizationId: 'org' }],
    [{ ...edge, sourceId: 'missing' }],
    [
      {
        ...edge,
        sourceKind: 'reward',
        sourceId: 'reward',
        sourceVersion: '1',
        sourceOrganizationId: 'org',
      },
    ],
    [
      {
        ...edge,
        sourceKind: 'reward',
        sourceId: 'reward',
        sourceVersion: '1',
        sourceOrganizationId: 'foreign',
      },
    ],
  ])('rejects invalid/missing/scoped/cyclic dependencies %#', async (edges) => {
    const f = graph(edges);
    await f.graph.load([root]);
    expect(f.graph.valid(root)).toBe(false);
  });
  it('rejects node, edge and depth overflow with small configured bounds', async () => {
    for (const limits of [
      { nodes: 1, edges: 10, levels: 10 },
      { nodes: 10, edges: 0, levels: 10 },
      { nodes: 10, edges: 10, levels: 1 },
    ]) {
      await expect(graph([edge], limits).graph.load([root])).rejects.toThrow(
        'selection too large',
      );
    }
  });
});
