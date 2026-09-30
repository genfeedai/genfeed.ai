import type { LearningExperimentSpecV1 } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { describe, expect, it } from 'vitest';
import {
  buildLearningExperimentReport,
  LearningEvidenceValidationError,
  type LearningExperimentObservation,
  learningAllocatedCostTotal,
  learningCostFractionValue,
} from '../../src/learning/experiment-report';

const spec: LearningExperimentSpecV1 = {
  schemaVersion: 1,
  kind: 'private_pilot',
  cellKey: 'cell',
  configVersion: 'rl-reward-v1-experimental',
  featureVersion: 'numeric-nine-v1',
  rewardVersion: 'rl-reward-v1-experimental',
  checkpointVersion: '48h-v1',
  candidateId: 'candidate',
  candidateHash: 'candidate-hash',
  controlId: 'builtin',
  controlHash: 'builtin-hash',
  format: 'text',
  objective: 'awareness',
  rewardProfileId: 'awareness-v1',
  startAt: '2026-01-01T00:00:00Z',
  endAt: '2026-01-29T00:00:00Z',
  assignmentUnit: 'request_destination_candidate',
  treatmentProbability: 0.1,
  cohortFraction: 1,
  seedCommitment: 'commitment',
  deadlines: {
    generationHours: 24,
    publicationHours: 168,
    checkpointHours: 49,
    settlementGraceHours: 24,
  },
  analysisVersion: 'rl-experiment-v1',
  primary: 'composite_reward',
  gateVersion: 'rl-promotion-v1',
  costBasis: 'observed_vendor_micro_usd',
  cadenceBasis: 'published_descendants_per_opportunity_day',
  approvedArmIds: ['baseline-v1', 'proof-steps-v1'],
  sourceManifestHash: 'manifest',
  synthetic: false,
};
const observations: LearningExperimentObservation[] = Array.from(
  { length: 240 },
  (_, i) => ({
    id: String(i),
    accountGroup: 'private-account',
    assignedAt: new Date(Date.UTC(2026, 0, 1 + (i % 28))).toISOString(),
    group: i % 2 ? 'treatment' : 'control',
    generated: true,
    readinessKnown: true,
    publishable: true,
    approved: true,
    published: true,
    unchanged: true,
    reward: i % 2 ? 0.8 : 0.2,
    costAllocations: [
      {
        attemptId: `attempt-${i}`,
        ledgerKind: 'llm',
        ledgerId: `ledger-${i}`,
        ledgerFingerprint: 'a'.repeat(64),
        vendorCostMicros: 100,
        opportunityIds: [String(i)],
      },
    ],
    attemptCount: 1,
    generationClosed: true,
    publishedDescendants: 1,
    publicationEnumerationComplete: true,
    criticalSafetyFailure: false,
    cadenceChanged: false,
    evidenceIds: [`event-${i}`],
  }),
);
const input = {
  experimentId: 'experiment',
  spec,
  specHash: 'hash',
  observations,
  cutoff: new Date('2026-02-10T00:00:00Z'),
  evidenceManifestHash: 'manifest',
  invalidationRevision: 0,
  dependenciesValid: true,
};
describe('frozen opportunity denominators and online gates', () => {
  it('replays frozen randomized comparisons and preserves all assigned denominators', () => {
    const report = buildLearningExperimentReport(input);
    expect(report.status).toBe('passed');
    expect(report.groups?.control.assigned).toBe(120);
    expect(report.estimates.primaryDifference.lower95).toBeCloseTo(0.6);
    expect(buildLearningExperimentReport(input)).toEqual(report);
  });
  it('does not invent zero cost or zero reward for failed generation', () => {
    const report = buildLearningExperimentReport({
      ...input,
      observations: [
        ...observations,
        {
          ...observations[0],
          id: 'failed',
          generated: false,
          readinessKnown: false,
          publishable: null,
          approved: false,
          published: false,
          unchanged: false,
          publishedDescendants: 0,
          censorReason: 'generation_failed',
          reward: null,
          costAllocations: null,
          generationClosed: false,
        },
      ],
    });
    expect(report.status).toBe('inconclusive');
    expect(report.groups?.control.assigned).toBe(121);
    expect(report.groups?.control.matureEligible).toBe(120);
    expect(report.estimates.costRatio.value).toBeNull();
  });
  it('blocks interim stopping, synthetic promotion and critical safety failure', () => {
    expect(
      buildLearningExperimentReport({
        ...input,
        cutoff: new Date('2026-01-30T00:00:00Z'),
      }).status,
    ).toBe('inconclusive');
    expect(
      buildLearningExperimentReport({
        ...input,
        spec: { ...spec, synthetic: true },
      }).status,
    ).toBe('inconclusive');
    expect(
      buildLearningExperimentReport({
        ...input,
        observations: observations.map((row, i) => ({
          ...row,
          criticalSafetyFailure: i === 0,
        })),
      }).status,
    ).toBe('failed');
  });
});

it.each([
  { attemptCount: Infinity },
  { attemptCount: -1 },
  { attemptCount: 0.5 },
  { readinessKnown: false, publishable: true },
  { published: false },
  { unchanged: false },
  { generated: false },
  {
    generated: false,
    approved: false,
    published: false,
    unchanged: false,
    reward: null,
    publishable: null,
    readinessKnown: true,
  },
])('blocks inconsistent or nonfinite online evidence: %j', (patch) => {
  expect(() =>
    buildLearningExperimentReport({
      ...input,
      observations: observations.map((row, i) =>
        i === 0 ? { ...row, ...patch } : row,
      ),
    }),
  ).toThrow(LearningEvidenceValidationError);
});

it('rejects duplicate opportunity identities before any counting or bootstrap', () => {
  expect(() =>
    buildLearningExperimentReport({
      ...input,
      observations: [...observations, { ...observations[0], reward: 0.9 }],
    }),
  ).toThrow(LearningEvidenceValidationError);
});
it('exposes only a safe code and field path for invalid stored evidence', () => {
  try {
    buildLearningExperimentReport({
      ...input,
      observations: [{ ...observations[0], attemptCount: Infinity }],
    });
  } catch (error) {
    expect(error).toBeInstanceOf(LearningEvidenceValidationError);
    expect(error).toMatchObject({
      code: 'invalid_evidence',
      path: 'observations[0].attemptCount',
    });
    return;
  }
  throw new Error('Expected invalid evidence rejection');
});

it('rejects unsafe aggregate diagnostic counts before serializing any report', () => {
  expect(() =>
    buildLearningExperimentReport({
      ...input,
      observations: observations.map((row) => ({
        ...row,
        attemptCount: Number.MAX_SAFE_INTEGER,
      })),
    }),
  ).toThrow(LearningEvidenceValidationError);
});

it('preserves exact one-third allocation conservation and report subset denominator', () => {
  const term = {
    attemptId: 'batch',
    ledgerKind: 'llm' as const,
    ledgerId: 'ledger',
    ledgerFingerprint: 'a'.repeat(64),
    vendorCostMicros: 1,
    opportunityIds: ['a', 'b', 'c'],
  };
  expect(learningAllocatedCostTotal([term]).value).toBeCloseTo(1 / 3, 14);
  expect(learningAllocatedCostTotal([term, term]).value).toBeCloseTo(2 / 3, 14);
  expect(learningAllocatedCostTotal([term, term, term]).value).toBe(1);
  expect(
    learningAllocatedCostTotal([{ ...term, vendorCostMicros: 3 }]).value,
  ).toBe(1);
});
it('rejects conflicting original allocation manifests and reused ledgers before aggregation', () => {
  const rows = observations.slice(0, 2).map((row) => ({
    ...row,
    costAllocations: [
      {
        attemptId: 'batch',
        ledgerKind: 'llm' as const,
        ledgerId: 'ledger',
        ledgerFingerprint: 'a'.repeat(64),
        vendorCostMicros: 1,
        opportunityIds: ['0', '1'],
      },
    ],
  }));
  expect(() =>
    buildLearningExperimentReport({ ...input, observations: rows }),
  ).not.toThrow();
  for (const patch of [
    { attemptId: 'other-attempt' },
    { vendorCostMicros: 2 },
    { opportunityIds: ['1'] },
    { ledgerFingerprint: 'b'.repeat(64) },
  ]) {
    expect(() =>
      buildLearningExperimentReport({
        ...input,
        observations: rows.map((row, i) =>
          i
            ? {
                ...row,
                costAllocations: row.costAllocations.map((term) => ({
                  ...term,
                  ...patch,
                })),
              }
            : row,
        ),
      }),
    ).toThrow(LearningEvidenceValidationError);
  }
});
it('keeps observed zero ledger and closed zero-attempt evidence distinct from missing settlement', () => {
  const zero = observations.map((row) => ({
    ...row,
    costAllocations:
      row.costAllocations?.map((term) => ({ ...term, vendorCostMicros: 0 })) ??
      null,
  }));
  expect(
    buildLearningExperimentReport({ ...input, observations: zero }).estimates
      .costRatio.value,
  ).toBe(1);
  const closed = observations.map((row) => ({
    ...row,
    attemptCount: 0,
    costAllocations: [],
  }));
  expect(
    buildLearningExperimentReport({ ...input, observations: closed }).groups
      ?.control.costComplete,
  ).toBe(120);
  const missing = observations.map((row, i) =>
    i === 0 ? { ...row, costAllocations: null } : row,
  );
  const report = buildLearningExperimentReport({
    ...input,
    observations: missing,
  });
  expect(report.groups?.control.costComplete).toBe(119);
  expect(report.estimates.costRatio.value).toBeNull();
});
it('marks safe input with an overflowing exact total inconclusive without losing coverage', () => {
  const rows = observations.map((row) => ({
    ...row,
    costAllocations:
      row.costAllocations?.map((term) => ({
        ...term,
        vendorCostMicros: Number.MAX_SAFE_INTEGER,
      })) ?? null,
  }));
  const report = buildLearningExperimentReport({
    ...input,
    observations: rows,
  });
  expect(report.status).toBe('inconclusive');
  expect(report.groups?.control.costComplete).toBe(120);
  expect(report.estimates.costRatio.value).toBeNull();
  expect(report.reasonCodes).toContain('non_finite_statistics');
  expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
});
it('bounds reduced exact arithmetic and refuses a positive amount that rounds to zero', () => {
  expect(learningCostFractionValue(1n, 1n << 4097n)).toEqual({
    value: null,
    reason: 'cost_precision_budget',
  });
  expect(learningCostFractionValue(1n, 1n << 1000n)).toEqual({
    value: null,
    reason: 'non_finite_statistics',
  });
  expect(learningCostFractionValue(1n << 4097n, 1n << 4097n)).toEqual({
    value: 1,
    reason: null,
  });
  expect(learningCostFractionValue(0n, 3n)).toEqual({ value: 0, reason: null });
});
