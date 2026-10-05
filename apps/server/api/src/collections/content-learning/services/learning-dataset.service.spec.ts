import {
  LearningDatasetService,
  validateLearningRows,
} from '@api/collections/content-learning/services/learning-dataset.service';
import {
  assertLearningDatasetCandidateCount,
  LearningDatasetGraph,
} from '@api/collections/content-learning/services/learning-dataset-graph.service';
import { LearningDependencyService } from '@api/collections/content-learning/services/learning-dependency.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  randomBytes: vi.fn((size: number) => Buffer.alloc(size, 1)),
}));

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
type RawQuery = { sql: string; values: unknown[] };
// Serves $queryRaw reads by matching a fragment of the generated SQL.
function rawReads(
  handlers: Array<[match: string, run: (query: RawQuery) => unknown]>,
  fallback: unknown = [],
) {
  return vi.fn(async (query: RawQuery | TemplateStringsArray) => {
    // Tagged-template calls (advisory fences) arrive as plain string arrays.
    const sql = 'sql' in query ? query.sql : query.join('?');
    for (const [match, run] of handlers)
      if (sql.includes(match)) return run(query as RawQuery);
    return fallback;
  });
}
// Entry columns of every bulk insert, decoded from the bound unnest arrays.
function insertedEntries(executeRaw: { mock: { calls: unknown[][] } }) {
  return (executeRaw.mock.calls as Array<[RawQuery]>)
    .filter(([query]) => query.sql.includes('content_learning_dataset_entries'))
    .flatMap(([query]) => {
      const [, , fingerprints, , groups, , , , , , , splits] = query.values as [
        string,
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
        string[],
      ];
      return fingerprints.map((sourceFingerprint, index) => ({
        sourceFingerprint,
        accountGroup: groups[index],
        split: splits[index],
      }));
    });
}
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
      $executeRaw: vi.fn().mockResolvedValue(1),
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
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
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
    edges: Array<{ derivedKind: string }>,
    limits?: { nodes: number; edges: number; levels: number },
  ) {
    const tx = {
      $queryRaw: rawReads([
        [
          'content_learning_dependencys',
          ({ values }) =>
            edges.filter(
              (edge: { derivedKind: string }) => edge.derivedKind === values[0],
            ),
        ],
        ['content_learning_rewards', () => [{ id: 'reward', version: 1 }]],
      ]),
    };
    return {
      tx,
      graph: new LearningDatasetGraph(tx as never, limits, true),
    };
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
    const reads = (table: string) =>
      f.tx.$queryRaw.mock.calls.filter(([query]) =>
        (query as RawQuery).sql.includes(table),
      );
    expect(reads('content_learning_rewards')).toHaveLength(1);
    expect(reads('content_learning_dependencys')).toHaveLength(2);
  });
  it.each(
    [
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
    ].map((edges) => ({ edges })),
  )(
    'rejects invalid/missing/scoped/cyclic dependencies %#',
    async ({ edges }) => {
      const f = graph(edges);
      await f.graph.load([root]);
      expect(f.graph.valid(root)).toBe(false);
    },
  );
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

describe('dataset pin parity with the shared resolver', () => {
  it('resolves nonpublication registered kinds with current immutable pin semantics', async () => {
    const kinds = [
      'account',
      'consent',
      'checkpoint',
      'baseline',
      'decision',
      'reward',
      'policy',
      'dataset',
      'run',
      'shared-policy',
      'release',
      'config',
      'experiment',
      'enrollment',
      'opportunity',
      'experiment-event',
      'provider_attempt',
      'llm_vendor_cost',
      'media_vendor_cost',
    ] as const;
    const value = {
      id: 'id',
      organizationId: 'id',
      accountId: 'id',
      epoch: 2,
      sharingConsentVersion: 3,
      version: 3,
      revision: 4,
      fingerprint: 'fingerprint',
      payloadHash: 'payload',
      manifestHash: 'manifest',
      configHash: 'hash',
      specHash: 'spec',
      accountEpoch: 2,
      consentNoticeVersion: 'notice',
      sourceId: 'id',
      sourceRevision: 'revision',
      learningAttemptId: 'attempt',
      updatedAt: new Date('2026-09-01'),
      artifactVersionPinId: 'artifact',
      postId: 'id',
      completedAt: new Date('2026-09-01'),
      source: 'fixture',
      contentDigest: 'digest',
      granted: true,
      revokedAt: null,
    };
    const names = [
      'organization',
      'brand',
      'credential',
      'post',
      'contentLearningAccount',
      'contentLearningConsent',
      'contentLearningCheckpoint',
      'contentLearningBaseline',
      'contentLearningDecision',
      'contentLearningReward',
      'contentLearningPolicyVersion',
      'contentLearningDataset',
      'contentLearningRun',
      'contentLearningSharedPolicy',
      'contentLearningRelease',
      'contentLearningExperiment',
      'contentLearningEnrollment',
      'contentLearningOpportunity',
      'contentLearningExperimentEvent',
      'llmVendorCost',
      'mediaVendorCost',
      'publishApproval',
      'postPublishFinalization',
      'contentVersionPin',
    ];
    const tx = Object.fromEntries(
      names.map((name) => [
        name,
        {
          findMany: vi.fn().mockResolvedValue([value]),
          findFirst: vi.fn().mockResolvedValue(value),
        },
      ]),
    );
    Object.assign(tx, { $queryRaw: vi.fn().mockResolvedValue([value]) });
    const prisma = tx as unknown as PrismaService;
    const shared = new LearningDependencyService(prisma);
    const graph = new LearningDatasetGraph(prisma);
    const bulk = new LearningDatasetGraph(prisma, undefined, true);
    for (const kind of kinds) {
      const global = [
        'dataset',
        'run',
        'shared-policy',
        'release',
        'config',
      ].includes(kind);
      const id = kind === 'config' ? 'numeric-nine-v1' : 'id',
        organizationId = global ? null : 'id';
      const resolved = await shared.resolve(kind, id, organizationId, prisma);
      expect((await graph.pins(kind, [id], organizationId)).get(id)).toBe(
        resolved.version,
      );
      expect((await graph.pins(kind, [id], global ? 'wrong' : null)).size).toBe(
        0,
      );
      if (['checkpoint', 'baseline', 'decision', 'reward'].includes(kind))
        expect((await bulk.pins(kind, [id], organizationId)).get(id)).toBe(
          resolved.version,
        );
    }
  });
});

describe('dataset envelope and immutable split parity', () => {
  const input = {
    organizationId: 'org',
    actorId: 'actor',
    requestId: 'req',
    rightsStatement: 'owned rights',
    profile: 'awareness',
    cell: 'cell',
    cutoff: '2026-09-29T00:00:00.000Z',
  };
  function fixture() {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      contentLearningOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      contentLearningDataset: {
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'dataset', ...data }),
          ),
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    const service = new LearningDatasetService(
      {
        $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
      } as unknown as PrismaService,
      {} as LearningDependencyService,
    );
    return { tx, service };
  }
  it('rejects row/source overflow before any snapshot writes', async () => {
    expect(() => assertLearningDatasetCandidateCount(11, 10)).toThrow(
      'selection too large',
    );
    expect(() => assertLearningDatasetCandidateCount(10, 10)).not.toThrow();
    expect(() => validateLearningRows(new Array(100001), cutoff)).toThrow(
      '100,000',
    );
    const f = fixture();
    await expect(
      f.service.create({
        ...input,
        sourceAccounts: Array.from({ length: 101 }, (_, i) => ({
          organizationId: 'org',
          accountId: `a${i}`,
        })),
      }),
    ).rejects.toThrow('100 source accounts');
    expect(f.tx.contentLearningDataset.create).not.toHaveBeenCalled();
  });
  it('rejects owned duplicate fingerprints and invalid numeric chronology', async () => {
    const f = fixture();
    await expect(
      f.service.create({ ...input, rows: [row, row] }),
    ).rejects.toThrow('Duplicate source fingerprint');
    for (const invalid of [
      { ...row, reward: NaN },
      { ...row, features: [NaN, 0, 1, 0, 1, 0, 1, 0, 1] },
      { ...row, decisionAt: 'invalid' },
      { ...row, decisionAt: '2026-09-04' },
      {
        ...row,
        probabilities: {
          'baseline-v1': 0,
          'question-example-v1': 1,
          'proof-steps-v1': 0,
        },
      },
    ])
      expect(() => validateLearningRows([invalid], cutoff)).toThrow();
  });
  it('preserves old temporal/account split algorithm and exact manifest for a fixed salt', async () => {
    const { createHmac, randomBytes } = await import('node:crypto');
    const { learningHash } = await import(
      '@api/collections/content-learning/services/learning-operation.service'
    );
    const salt = Buffer.alloc(32, 7);
    vi.mocked(randomBytes).mockReturnValueOnce(salt as never);
    const raw = [8, 11, 17, 23, 32].flatMap((length, account) =>
      Array.from({ length }, (_, i) => ({
        ...row,
        synthetic: false,
        sourceFingerprint: `account-${account}-row-${i}`,
        accountGroup: `account-${account}`,
        decisionAt: new Date(
          Date.parse(row.decisionAt) + i * 1000,
        ).toISOString(),
      })),
    );
    const sorted = raw
      .map((value) => ({
        ...value,
        accountGroup: createHmac('sha256', salt.toString('hex'))
          .update(value.accountGroup)
          .digest('hex'),
      }))
      .sort(
        (a, b) =>
          a.accountGroup.localeCompare(b.accountGroup) ||
          a.decisionAt.localeCompare(b.decisionAt) ||
          a.sourceFingerprint.localeCompare(b.sourceFingerprint),
      );
    const groups = [...new Set(sorted.map((value) => value.accountGroup))].sort(
      (a, b) => learningHash(a).localeCompare(learningHash(b)),
    );
    const holdout = new Set(
      groups.slice(0, Math.max(1, Math.ceil(groups.length * 0.2))),
    );
    const temporal = new Set<string>();
    for (const account of groups.filter((id) => !holdout.has(id))) {
      const oldRows = sorted.filter((value) => value.accountGroup === account);
      for (const value of oldRows.slice(Math.floor(oldRows.length * 0.8)))
        temporal.add(value.sourceFingerprint);
    }
    const split = (value: (typeof sorted)[number]) =>
      holdout.has(value.accountGroup)
        ? 'account_holdout'
        : temporal.has(value.sourceFingerprint)
          ? 'temporal_holdout'
          : 'training';
    const f = fixture(),
      dataset = await f.service.create({ ...input, rows: raw });
    expect(dataset.manifestHash).toBe(
      learningHash([
        input.cell,
        input.profile,
        new Date(input.cutoff).toISOString(),
        sorted.map((value) => [value, split(value)]),
      ]),
    );
    const entries = insertedEntries(f.tx.$executeRaw);
    expect(
      entries.map((value) => ({
        fingerprint: value.sourceFingerprint,
        group: value.accountGroup,
        split: value.split,
      })),
    ).toEqual(
      sorted.map((value) => ({
        fingerprint: value.sourceFingerprint,
        group: value.accountGroup,
        split: split(value),
      })),
    );
    const training = sorted.filter(
      (value) => split(value) === 'training',
    ).length;
    expect(dataset.counts).toEqual({
      training,
      temporalHoldout: temporal.size,
      accountHoldout: sorted.filter(
        (value) => split(value) === 'account_holdout',
      ).length,
      total: raw.length,
    });
    expect(dataset.status).toBe(
      training < 30 ? 'insufficient_data' : 'validated',
    );
    expect(dataset.origin).toBe('owned');
    expect(dataset.synthetic).toBe(false);
  });
  it('detects excessive depth hidden behind an earlier cached graph page', async () => {
    const edges = [
      {
        derivedId: 'r0',
        derivedKind: 'reward',
        sourceKind: 'config',
        sourceId: 'numeric-nine-v1',
        sourceVersion: 'numeric-nine-v1',
        sourceOrganizationId: null,
        valid: true,
      },
      {
        derivedId: 'r1',
        derivedKind: 'reward',
        sourceKind: 'reward',
        sourceId: 'r0',
        sourceVersion: '1',
        sourceOrganizationId: 'org',
        valid: true,
      },
    ];
    const tx = {
      $queryRaw: rawReads([
        [
          'content_learning_rewards',
          ({ values }) =>
            (values[0] as string[]).map((id) => ({ id, version: 1 })),
        ],
        [
          'content_learning_dependencys',
          ({ values }) =>
            edges.filter(
              (edge) =>
                edge.derivedKind === values[0] &&
                (values[1] as string[]).includes(edge.derivedId),
            ),
        ],
      ]),
    };
    const graph = new LearningDatasetGraph(
      tx as never,
      { nodes: 10, edges: 10, levels: 2 },
      true,
    );
    const first = { kind: 'reward' as const, id: 'r0', organizationId: 'org' },
      second = { ...first, id: 'r1' };
    await graph.load([first]);
    expect(graph.valid(first)).toBe(true);
    await graph.load([second]);
    expect(() => graph.valid(second)).toThrow('selection too large');
  });
});

describe('candidate eligibility paging', () => {
  it('finds a later eligible row beyond 100001 early ineligible rewards', async () => {
    const eligible = {
      id: 'reward-0100001',
      organizationId: 'org',
      credentialId: 'credential',
      decisionId: 'decision',
      version: 1,
      composite: 0.5,
      sourceFingerprint: 'later-fingerprint',
      createdAt: new Date('2026-09-03'),
      checkpointId: 'checkpoint',
      baselineId: 'baseline',
      status: 'valid',
    };
    const decision = {
      id: 'decision',
      payloadHash: 'payload',
      createdAt: new Date('2026-09-01'),
      contextVector: row.features,
      selectedArmId: row.armId,
      probabilities: row.probabilities,
    };
    const candidateRead = vi.fn(({ values }: RawQuery) => {
      const cursor = values.length === 5 ? (values[0] as string) : undefined;
      const take = values[values.length - 1] as number;
      const start = cursor ? Number(cursor.slice(7)) + 1 : 0;
      return Array.from(
        { length: Math.max(0, Math.min(take, 100002 - start)) },
        (_, offset) => {
          const index = start + offset;
          return {
            ...eligible,
            id: `reward-${String(index).padStart(7, '0')}`,
            composite: index === 100001 ? 0.5 : null,
          };
        },
      );
    });
    const tx = {
      $queryRaw: rawReads([
        ['FOR UPDATE', () => [{ id: 'decision' }]],
        ['ORDER BY id ASC', candidateRead],
        [
          'GROUP BY "decisionId"',
          () => [{ decisionId: 'decision', version: 1 }],
        ],
        ['content_learning_rewards', () => [eligible]],
        ['AND state = ', () => [decision]],
        [
          'content_learning_dependencys',
          ({ values }) =>
            values[0] === 'reward'
              ? [
                  {
                    derivedId: eligible.id,
                    sourceKind: 'config',
                    sourceId: 'numeric-nine-v1',
                    sourceVersion: 'numeric-nine-v1',
                    sourceOrganizationId: null,
                    valid: true,
                  },
                ]
              : [],
        ],
      ]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      contentLearningOperation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      contentLearningAccount: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'account',
          organizationId: 'org',
          credentialId: 'credential',
          sharingConsentVersion: 1,
        }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'account', sharingConsentVersion: 1 }]),
      },
      contentLearningConsent: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'consent',
          organizationId: 'org',
          accountId: 'account',
          version: 1,
          grantedAt: new Date('2026-08-01'),
        }),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'consent', accountId: 'account', version: 1 },
          ]),
      },
      contentLearningDataset: {
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'dataset', ...data }),
          ),
      },
    };
    const service = new LearningDatasetService(
      {
        $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
      } as unknown as PrismaService,
      {} as LearningDependencyService,
    );
    const result = await service.create({
      organizationId: 'org',
      actorId: 'actor',
      requestId: 'later',
      rightsStatement: 'owned',
      profile: 'awareness',
      cell: 'cell',
      cutoff: '2026-09-29',
      sourceAccounts: [{ organizationId: 'org', accountId: 'account' }],
    });
    expect(result.counts).toMatchObject({ total: 1 });
    expect(insertedEntries(tx.$executeRaw)[0].sourceFingerprint).toBe(
      'later-fingerprint',
    );
    expect(candidateRead).toHaveBeenCalledTimes(102);
  });
});
