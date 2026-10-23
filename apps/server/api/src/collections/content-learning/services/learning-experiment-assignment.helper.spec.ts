import { createHash, createHmac } from 'node:crypto';
import type { learningCandidateIdentity } from '@api/collections/content-learning/services/learning-decision-batch.helper';
import {
  attachLearningOpportunity,
  closeLearningPilotAssignment,
  type LearningPilotAssignmentDeps,
  type LearningPilotAssignmentScope,
  learningPilotDrawV1,
  learningPilotExclusionsV1,
  learningPilotSnapshotExclusionsV1,
  openLearningPilotAssignment,
} from '@api/collections/content-learning/services/learning-experiment-assignment.helper';
import { learningCanonicalHash } from '@api/collections/content-learning/services/learning-operation.service';
import { readCurrentLearningPilotV1 } from '@api/collections/content-learning/services/learning-pilot-gate.helper';
import { initializeLearningPolicy } from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));
vi.mock(
  '@api/collections/content-learning/services/learning-pilot-gate.helper',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@api/collections/content-learning/services/learning-pilot-gate.helper')
    >()),
    readCurrentLearningPilotV1: vi.fn(),
  }),
);
vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: (value: string) => value.replace(/^enc:/, ''),
    encrypt: (value: string) => `enc:${value}`,
  },
}));

const seedHex = 'ab'.repeat(32);
const at = new Date('2026-10-08T12:00:00Z');
const baselineArm = 'baseline-v1';
const questionArm = 'question-example-v1';
const proofArm = 'proof-steps-v1';

function identityFor(
  requestKey: string,
): ReturnType<typeof learningCandidateIdentity> {
  return {
    objective: 'awareness',
    destinationKey: 'destination',
    payloadHash: 'payload',
    requestKey,
    candidateIndex: 0,
  };
}
function groupOf(requestKey: string): 'treatment' | 'control' {
  return learningPilotDrawV1(seedHex, [
    'group',
    'experiment',
    'org',
    requestKey,
    'destination',
    0,
  ]) < 0.1
    ? 'treatment'
    : 'control';
}
function requestKeyFor(group: 'treatment' | 'control'): string {
  for (let i = 0; i < 1000; i++)
    if (groupOf(`key-${i}`) === group) return `key-${i}`;
  throw new Error('no request key found');
}
function fixture(
  options: {
    exclusions?: Array<{ armId: string; reasonCode: string }> | undefined;
    policyArmState?: unknown;
    policy?: 'lineage' | 'none';
    approvedArmIds?: string[];
    count?: number;
    mode?: string;
  } = {},
) {
  const spec = {
    schemaVersion: 1,
    kind: 'private_pilot',
    format: 'text',
    objective: 'awareness',
    rewardProfileId: 'profile',
    treatmentProbability: 0.1,
    seedCommitment: createHash('sha256').update(seedHex).digest('hex'),
    approvedArmIds: [baselineArm, questionArm, proofArm],
  };
  const experiment = {
    id: 'experiment',
    organizationId: 'org',
    encryptedSeed: `enc:${seedHex}`,
    spec,
    specHash: learningCanonicalHash(spec),
  };
  const enrollment = { id: 'enrollment' };
  const candidate = { id: 'candidate' };
  const state = initializeLearningPolicy();
  state[questionArm].b[0] = 20;
  const policy =
    options.policy === 'none'
      ? null
      : {
          id: 'candidate',
          armState: options.policyArmState ?? state,
          version: 1,
        };
  const tx = {
    contentLearningOpportunity: {
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: 'opportunity', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
    },
  };
  const dependencies = {
    valid: vi.fn().mockResolvedValue(true),
    resolve: vi.fn().mockImplementation((kind, id) => ({
      kind,
      id,
      organizationId: 'org',
      version: 'v',
    })),
    link: vi.fn(),
  };
  const policies = { current: vi.fn().mockResolvedValue(policy) };
  const deps = {
    tx: tx as unknown as Prisma.TransactionClient,
    dependencies,
    policies,
  } as unknown as LearningPilotAssignmentDeps;
  const scope = {
    isSingleCandidate: true,
    account: {
      mode: options.mode ?? 'live',
      failureReason: null,
      epoch: 1,
      approvedArmIds: options.approvedArmIds ?? [questionArm, proofArm],
    },
    scope: {
      format: 'text',
      objective: 'awareness',
      rewardProfileId: 'profile',
    },
    scopeKey: 'scope',
    baseline: { count: options.count ?? 20, validity: 'valid' },
    features: [1, 0, 1, 0, 1, 0, 1, 0, 1],
    decisionAt: at,
    credentialId: 'credential',
  } as unknown as LearningPilotAssignmentScope;
  const input = {
    organizationId: 'org',
    brandId: 'brand',
    format: 'text' as const,
    harnessEnabled: true,
    compatible: true,
    originalPrompt: 'prompt',
    armExclusions: options.exclusions,
    context: {
      credentialId: 'credential',
      requestKey: 'key',
      candidateIndex: 0,
      generationId: 'post',
    },
  };
  return {
    experiment,
    enrollment,
    candidate,
    tx,
    dependencies,
    policies,
    deps,
    scope,
    input,
    policy,
  };
}
type Fixture = ReturnType<typeof fixture>;

async function open(
  f: Fixture,
  requestKey: string,
  override: Partial<Fixture['input']> = {},
) {
  vi.mocked(readCurrentLearningPilotV1).mockClear();
  vi.mocked(readCurrentLearningPilotV1).mockResolvedValue({
    experiment: f.experiment,
    enrollment: f.enrollment,
    candidate: f.candidate,
  } as unknown as Awaited<ReturnType<typeof readCurrentLearningPilotV1>>);
  return openLearningPilotAssignment(
    f.deps,
    f.scope,
    {
      ...f.input,
      ...override,
      context: { ...f.input.context, requestKey },
    },
    identityFor(requestKey),
  );
}

describe('learningPilotDrawV1', () => {
  it('recomputes from the committed seed and stays in [0, 1)', () => {
    const parts = ['group', 'experiment', 'org', 'key', 'destination', 0];
    const digest = createHmac('sha256', Buffer.from(seedHex, 'hex'))
      .update(JSON.stringify(parts))
      .digest('hex');
    const draw = learningPilotDrawV1(seedHex, parts);
    expect(draw).toBe(Number.parseInt(digest.slice(0, 13), 16) / 2 ** 52);
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(draw).toBeLessThan(1);
    expect(learningPilotDrawV1(seedHex, parts)).toBe(draw);
    expect(learningPilotDrawV1(seedHex, [...parts, 1])).not.toBe(draw);
  });
});

describe('learningPilotExclusionsV1', () => {
  it('excludes every non-baseline arm when compatibility is unknown', () => {
    expect(learningPilotExclusionsV1(undefined)).toEqual([
      { armId: proofArm, reasonCode: 'brand_compatibility_unknown' },
      { armId: questionArm, reasonCode: 'brand_compatibility_unknown' },
    ]);
  });
  it('keeps provided exclusions sorted, unique and never excludes baseline', () => {
    expect(
      learningPilotExclusionsV1([
        { armId: questionArm, reasonCode: 'b' },
        { armId: baselineArm, reasonCode: 'x' },
        { armId: questionArm, reasonCode: 'c' },
        { armId: proofArm, reasonCode: 'a' },
      ]),
    ).toEqual([
      { armId: proofArm, reasonCode: 'a' },
      { armId: questionArm, reasonCode: 'b' },
    ]);
    expect(learningPilotExclusionsV1([])).toEqual([]);
  });
  it('reads only well-formed persisted exclusions', () => {
    expect(
      learningPilotSnapshotExclusionsV1({
        armExclusions: [
          { armId: questionArm, reasonCode: 'a' },
          { armId: 7 },
          'bad',
        ],
      }),
    ).toEqual([{ armId: questionArm, reasonCode: 'a' }]);
    expect(learningPilotSnapshotExclusionsV1(null)).toEqual([]);
    expect(learningPilotSnapshotExclusionsV1({ armExclusions: 'x' })).toEqual(
      [],
    );
  });
});

describe('openLearningPilotAssignment', () => {
  it.each(['shadow', 'paused', 'disabled'])(
    'returns null and reads nothing when the account is %s',
    async (mode) => {
      const f = fixture({ mode });
      expect(await open(f, 'key')).toBeNull();
      expect(readCurrentLearningPilotV1).not.toHaveBeenCalled();
      expect(f.tx.contentLearningOpportunity.create).not.toHaveBeenCalled();
    },
  );
  it.each<[string, (f: Fixture) => Partial<Fixture['input']>]>([
    [
      'a batch',
      (f) => {
        f.scope.isSingleCandidate = false;
        return {};
      },
    ],
    ['harness off', () => ({ harnessEnabled: false })],
    ['incompatible', () => ({ compatible: false })],
  ])('returns null for %s', async (_name, change) => {
    const f = fixture();
    expect(await open(f, 'key', change(f))).toBeNull();
    expect(readCurrentLearningPilotV1).not.toHaveBeenCalled();
    expect(f.tx.contentLearningOpportunity.create).not.toHaveBeenCalled();
  });
  it('returns null for an insufficient baseline', async () => {
    const f = fixture({ count: 19 });
    expect(await open(f, 'key')).toBeNull();
    expect(readCurrentLearningPilotV1).not.toHaveBeenCalled();
  });
  it('returns null when the pilot does not match the frozen scope', async () => {
    const f = fixture();
    f.scope.scope.rewardProfileId = 'other';
    expect(await open(f, 'key')).toBeNull();
  });
  it('returns null when the seed does not match its commitment', async () => {
    const f = fixture();
    f.experiment.encryptedSeed = `enc:${'cd'.repeat(32)}`;
    expect(await open(f, 'key')).toBeNull();
    expect(f.tx.contentLearningOpportunity.create).not.toHaveBeenCalled();
  });
  it('returns null when no pilot is current', async () => {
    const f = fixture();
    vi.mocked(readCurrentLearningPilotV1).mockResolvedValue(null);
    expect(
      await openLearningPilotAssignment(
        f.deps,
        f.scope,
        f.input,
        identityFor('key'),
      ),
    ).toBeNull();
    expect(f.policies.current).not.toHaveBeenCalled();
  });

  it('draws a control opportunity that selects the baseline arm', async () => {
    const f = fixture({ exclusions: [] });
    const key = requestKeyFor('control');
    const result = await open(f, key);
    expect(result?.decisionFields).toMatchObject({
      selectedArmId: baselineArm,
      selectedProbability: 1,
      assignment: 'control',
      assignmentProbability: 0.9,
      censorshipReason: 'experiment_control',
      opportunityId: 'opportunity',
      eligibleArmIds: [baselineArm, proofArm, questionArm].sort(),
    });
    expect(result?.decisionFields.probabilities).toEqual({
      [baselineArm]: 1,
      [questionArm]: 0,
      [proofArm]: 0,
    });
    const marginal = result?.decisionFields.executionProbabilities as Record<
      string,
      number
    >;
    expect(marginal[baselineArm]).toBeCloseTo(0.1 * (0.05 / 3) + 0.9, 9);
    expect(marginal[questionArm]).toBeCloseTo(0.1 * (0.05 / 3 + 0.95), 9);
    expect(result?.decisionFields.executionProbability).toBe(
      marginal[baselineArm],
    );
    expect(f.tx.contentLearningOpportunity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org',
        experimentId: 'experiment',
        enrollmentId: 'enrollment',
        requestKey: key,
        group: 'control',
        groupProbability: 0.9,
        specHash: f.experiment.specHash,
        postId: 'post',
        state: 'assigned',
        assignedAt: at,
        deadlineAt: new Date(at.getTime() + 24 * 3_600_000),
        assignmentDraw: learningPilotDrawV1(seedHex, [
          'group',
          'experiment',
          'org',
          key,
          'destination',
          0,
        ]),
      }),
    });
  });

  it('records the numeric treatment and marginal vectors of a greedy-baseline policy', async () => {
    const f = fixture({
      exclusions: [],
      policyArmState: initializeLearningPolicy(),
    });
    const result = await open(f, requestKeyFor('treatment'));
    const treatment = result?.snapshot.treatmentProbabilities as Record<
      string,
      number
    >;
    expect(treatment[baselineArm]).toBeCloseTo(0.9666666667, 9);
    const marginal = result?.decisionFields.executionProbabilities as Record<
      string,
      number
    >;
    expect(marginal[baselineArm]).toBeCloseTo(0.9966666667, 9);
    expect(result?.decisionFields).toMatchObject({
      assignment: 'pilot',
      assignmentProbability: 0.1,
    });
  });

  it('selects from the treatment vector for a treatment draw', async () => {
    const f = fixture({ exclusions: [] });
    const results = [];
    for (let i = 0; i < 400 && results.length < 1; i++) {
      const key = `treat-${i}`;
      if (groupOf(key) !== 'treatment') continue;
      const result = await open(f, key);
      if (result?.decisionFields.selectedArmId !== baselineArm)
        results.push(result);
    }
    expect(results[0]?.decisionFields).toMatchObject({
      selectedArmId: questionArm,
      assignment: 'pilot',
      accountPolicyId: 'candidate',
      censorshipReason: null,
    });
    expect(results[0]?.policy?.id).toBe('candidate');
    const conditional = results[0]?.decisionFields.probabilities as Record<
      string,
      number
    >;
    expect(conditional[questionArm]).toBeCloseTo(0.05 / 3 + 0.95, 9);
  });

  it('keeps only the baseline arm when exclusions are unknown', async () => {
    const f = fixture({ exclusions: undefined });
    const result = await open(f, requestKeyFor('treatment'));
    expect(result?.decisionFields.eligibleArmIds).toEqual([baselineArm]);
    expect(result?.decisionFields.selectedArmId).toBe(baselineArm);
    expect(result?.decisionFields.censorshipReason).toBe(
      'experiment_treatment_baseline',
    );
    expect(result?.snapshot.armExclusions).toEqual([
      { armId: proofArm, reasonCode: 'brand_compatibility_unknown' },
      { armId: questionArm, reasonCode: 'brand_compatibility_unknown' },
    ]);
  });

  it('intersects the spec and account arm filters and honours exclusions', async () => {
    const f = fixture({
      approvedArmIds: [questionArm],
      exclusions: [{ armId: proofArm, reasonCode: 'learning.test' }],
    });
    const result = await open(f, requestKeyFor('control'));
    expect(result?.decisionFields.eligibleArmIds).toEqual([
      baselineArm,
      questionArm,
    ]);
    const excluded = fixture({
      exclusions: [{ armId: questionArm, reasonCode: 'learning.test' }],
    });
    expect(
      (await open(excluded, requestKeyFor('control')))?.decisionFields
        .eligibleArmIds,
    ).toEqual([baselineArm, proofArm]);
  });

  it.each([
    [
      'an unavailable candidate',
      { policy: 'none' as const },
      'experiment_candidate_unavailable',
    ],
    [
      'a malformed policy',
      { policyArmState: { broken: true } },
      'experiment_candidate_invalid',
    ],
  ])(
    'falls back to the control vector for %s',
    async (_name, options, reason) => {
      const f = fixture({ exclusions: [], ...options });
      const result = await open(f, requestKeyFor('treatment'));
      expect(result?.snapshot.treatmentProbabilities).toEqual(
        result?.snapshot.controlProbabilities,
      );
      expect(result?.decisionFields).toMatchObject({
        selectedArmId: baselineArm,
        censorshipReason: reason,
      });
      expect(result?.decisionFields.accountPolicyId).toBeUndefined();
      expect(result?.snapshot.treatmentUnavailableReason).toBe(reason);
    },
  );

  it('is deterministic for a repeated identity', async () => {
    const a = await open(fixture({ exclusions: [] }), 'repeat');
    const b = await open(fixture({ exclusions: [] }), 'repeat');
    expect(a?.decisionFields).toEqual(b?.decisionFields);
  });
});

describe('closeLearningPilotAssignment', () => {
  const decision = { id: 'decision', organizationId: 'org' };
  it('back-links the opportunity and records all four dependency edges', async () => {
    const f = fixture({ exclusions: [] });
    const assignment = await open(f, requestKeyFor('control'));
    if (!assignment) throw new Error('expected assignment');
    expect(assignment.policy?.id).toBe('candidate');
    await closeLearningPilotAssignment(
      f.deps,
      assignment,
      decision as Parameters<typeof closeLearningPilotAssignment>[2],
    );
    expect(f.tx.contentLearningOpportunity.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'opportunity',
        organizationId: 'org',
        decisionId: null,
        isDeleted: false,
      },
      data: { decisionId: 'decision' },
    });
    expect(
      f.dependencies.resolve.mock.calls.map(([kind, id]) => `${kind}:${id}`),
    ).toEqual([
      'experiment:experiment',
      'opportunity:opportunity',
      'enrollment:enrollment',
      'opportunity:opportunity',
      'opportunity:opportunity',
      'decision:decision',
      'policy:candidate',
      'decision:decision',
    ]);
    expect(f.dependencies.link).toHaveBeenCalledTimes(4);
  });
  it('omits the policy edge when no policy was used', async () => {
    const f = fixture({ exclusions: [], policy: 'none' });
    const assignment = await open(f, requestKeyFor('control'));
    if (!assignment) throw new Error('expected assignment');
    await closeLearningPilotAssignment(
      f.deps,
      assignment,
      decision as Parameters<typeof closeLearningPilotAssignment>[2],
    );
    expect(f.dependencies.link).toHaveBeenCalledTimes(3);
  });
  it('fails when the opportunity was already assigned', async () => {
    const f = fixture({ exclusions: [] });
    const assignment = await open(f, requestKeyFor('control'));
    if (!assignment) throw new Error('expected assignment');
    f.tx.contentLearningOpportunity.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      closeLearningPilotAssignment(
        f.deps,
        assignment,
        decision as Parameters<typeof closeLearningPilotAssignment>[2],
      ),
    ).rejects.toThrow('already assigned');
    expect(f.dependencies.link).not.toHaveBeenCalled();
  });
});

describe('attachLearningOpportunity', () => {
  const decision = {
    id: 'decision',
    organizationId: 'org',
    credentialId: 'credential',
    opportunityId: 'opportunity',
    contextSnapshot: {
      armExclusions: [{ armId: questionArm, reasonCode: 'learning.test' }],
    },
  } as unknown as Parameters<typeof attachLearningOpportunity>[1];
  const resolution = {
    receipt: {
      mode: 'live' as const,
      configVersion: 'rl-reward-v1-experimental',
      synthetic: false,
      reason: 'experiment_control',
    },
    contribution: {},
  };
  it('adds scoped opportunity provenance and persisted exclusions', async () => {
    const f = fixture();
    f.tx.contentLearningOpportunity.findFirst.mockResolvedValue({
      id: 'opportunity',
      experimentId: 'experiment',
    });
    const result = await attachLearningOpportunity(
      f.deps.tx,
      decision,
      resolution,
    );
    expect(f.tx.contentLearningOpportunity.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        id: 'opportunity',
        credentialId: 'credential',
        decisionId: 'decision',
        organizationId: 'org',
      },
    });
    expect(result.receipt).toMatchObject({
      opportunityId: 'opportunity',
      experimentId: 'experiment',
      reason: 'experiment_control',
    });
    expect(result.exclusions).toEqual([
      { armId: questionArm, reasonCode: 'learning.test' },
    ]);
  });
  it('suppresses a decision whose opportunity row is missing', async () => {
    const f = fixture();
    f.tx.contentLearningOpportunity.findFirst.mockResolvedValue(null);
    const result = await attachLearningOpportunity(
      f.deps.tx,
      decision,
      resolution,
    );
    expect(result.receipt.reason).toBe('experiment_assignment_unavailable');
    expect(result.receipt.opportunityId).toBeUndefined();
    expect(result.contribution).toEqual({});
  });
});
