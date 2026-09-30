import type {
  LearningEstimateV1,
  LearningEvaluationReportV1,
  LearningExperimentGroupV1,
  LearningExperimentSpecV1,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { learningSeededRandom } from './evaluation';
export interface LearningExperimentObservation {
  id: string;
  accountGroup: string;
  assignedAt: string;
  group: 'control' | 'treatment';
  generated: boolean;
  readinessKnown: boolean;
  publishable: boolean | null;
  approved: boolean;
  published: boolean;
  unchanged: boolean;
  reward: number | null;
  censorReason?: string;
  costMicros: number | null;
  attemptCount: number;
  generationClosed: boolean;
  publishedDescendants: number;
  publicationEnumerationComplete: boolean;
  criticalSafetyFailure: boolean;
  cadenceChanged: boolean;
  evidenceIds: string[];
}
export interface LearningExperimentReportInput {
  experimentId: string;
  spec: LearningExperimentSpecV1;
  specHash: string;
  observations: readonly LearningExperimentObservation[];
  cutoff: Date;
  evidenceManifestHash: string;
  invalidationRevision: number;
  dependenciesValid: boolean;
}
export class LearningEvidenceValidationError extends Error {
  readonly code = 'invalid_evidence';
  constructor(readonly path: string) {
    super('Invalid stored learning evidence');
    this.name = 'LearningEvidenceValidationError';
  }
}
function validateObservations(
  rows: readonly LearningExperimentObservation[],
): void {
  const seen = new Set<string>();
  let attemptTotal = 0n,
    descendantTotal = 0n;
  const reject = (index: number, field: string): never => {
    throw new LearningEvidenceValidationError(
      `observations[${index}].${field}`,
    );
  };
  rows.forEach((row, index) => {
    if (
      typeof row.id !== 'string' ||
      !row.id ||
      row.id.length > 256 ||
      seen.has(row.id)
    )
      reject(index, 'id');
    seen.add(row.id);
    if (
      typeof row.accountGroup !== 'string' ||
      !row.accountGroup ||
      row.accountGroup.length > 256
    )
      reject(index, 'accountGroup');
    if (!['control', 'treatment'].includes(row.group)) reject(index, 'group');
    if (!Number.isFinite(new Date(row.assignedAt).getTime()))
      reject(index, 'assignedAt');
    for (const field of ['attemptCount', 'publishedDescendants'] as const)
      if (!Number.isSafeInteger(row[field]) || row[field] < 0)
        reject(index, field);
    attemptTotal += BigInt(row.attemptCount);
    descendantTotal += BigInt(row.publishedDescendants);
    if (attemptTotal > BigInt(Number.MAX_SAFE_INTEGER))
      reject(index, 'attemptCount');
    if (descendantTotal > BigInt(Number.MAX_SAFE_INTEGER))
      reject(index, 'publishedDescendants');
    if (
      row.costMicros !== null &&
      (!Number.isSafeInteger(row.costMicros) || row.costMicros < 0)
    )
      reject(index, 'costMicros');
    if (
      row.reward !== null &&
      (!Number.isFinite(row.reward) ||
        Math.abs(row.reward) > 1 ||
        !row.published ||
        !row.unchanged)
    )
      reject(index, 'reward');
    for (const field of [
      'generated',
      'readinessKnown',
      'approved',
      'published',
      'unchanged',
      'generationClosed',
      'publicationEnumerationComplete',
      'criticalSafetyFailure',
      'cadenceChanged',
    ] as const)
      if (typeof row[field] !== 'boolean') reject(index, field);
    if (row.publishable !== null && typeof row.publishable !== 'boolean')
      reject(index, 'publishable');
    if (
      !row.generated &&
      (row.approved ||
        row.published ||
        row.unchanged ||
        row.reward !== null ||
        row.publishable === true)
    )
      reject(index, 'generated');
    if (row.readinessKnown && !row.generated) reject(index, 'readinessKnown');
    if (row.unchanged && !row.published) reject(index, 'unchanged');
    if (!row.readinessKnown && row.publishable !== null)
      reject(index, 'publishable');
  });
}
function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value / values.length, 0);
  return Number.isFinite(total) ? total : null;
}
function ratio(
  treatment: number | null,
  control: number | null,
): number | null {
  if (treatment === null || control === null) return null;
  if (control === 0) return treatment === 0 ? 1 : null;
  const value = treatment / control;
  return Number.isFinite(value) ? value : null;
}
function metrics(rows: readonly LearningExperimentObservation[]) {
  const control = rows.filter((row) => row.group === 'control'),
    treatment = rows.filter((row) => row.group === 'treatment');
  const group = (items: readonly LearningExperimentObservation[]) => ({
    reward: average(
      items.flatMap((row) => (row.reward === null ? [] : [row.reward])),
    ),
    approval: average(items.map((row) => Number(row.approved))),
    publishability: items.some((row) => row.publishable === null)
      ? null
      : average(items.map((row) => Number(row.publishable))),
    cost:
      items.some((row) => row.costMicros === null || !row.generationClosed) ||
      items
        .filter((row) => row.costMicros !== null)
        .reduce(
          (total, row) =>
            total +
            BigInt(
              Number.isSafeInteger(row.costMicros) ? (row.costMicros ?? 0) : 0,
            ),
          0n,
        ) > BigInt(Number.MAX_SAFE_INTEGER)
        ? null
        : average(items.map((row) => row.costMicros ?? 0)),
    cadence: items.some(
      (row) => !row.publicationEnumerationComplete || row.cadenceChanged,
    )
      ? null
      : average(items.map((row) => row.publishedDescendants / 7)),
  });
  const c = group(control),
    t = group(treatment),
    difference = (a: number | null, b: number | null) =>
      a === null || b === null ? null : a - b;
  return {
    controlMean: c.reward,
    treatmentMean: t.reward,
    primaryDifference: difference(t.reward, c.reward),
    approvalDifference: difference(t.approval, c.approval),
    publishabilityDifference: difference(t.publishability, c.publishability),
    costRatio: ratio(t.cost, c.cost),
    cadenceRatio: ratio(t.cadence, c.cadence),
  };
}
export function buildLearningExperimentReport(
  input: LearningExperimentReportInput,
): LearningEvaluationReportV1 {
  validateObservations(input.observations);
  const spec = input.spec,
    reasonCodes: string[] = [],
    start = new Date(spec.startAt).getTime(),
    end = new Date(spec.endAt).getTime();
  const observations = input.observations.filter(
    (row) =>
      new Date(row.assignedAt).getTime() >= start &&
      new Date(row.assignedAt).getTime() < end,
  );
  if (input.cutoff.getTime() < end + 241 * 3600000)
    reasonCodes.push('analysis_not_frozen');
  if (spec.synthetic) reasonCodes.push('synthetic_evidence');
  if (!input.dependenciesValid) reasonCodes.push('invalid_dependency');
  const summarize = (
    group: 'control' | 'treatment',
  ): LearningExperimentGroupV1 => {
    const rows = observations.filter((row) => row.group === group),
      censorCounts: Record<string, number> = {};
    for (const row of rows)
      if (row.censorReason)
        censorCounts[row.censorReason] =
          (censorCounts[row.censorReason] ?? 0) + 1;
    return {
      assigned: rows.length,
      generated: rows.filter((row) => row.generated).length,
      readinessKnown: rows.filter((row) => row.readinessKnown).length,
      publishable: rows.filter((row) => row.publishable === true).length,
      approved: rows.filter((row) => row.approved).length,
      published: rows.filter((row) => row.published).length,
      unchanged: rows.filter((row) => row.unchanged).length,
      matureEligible: rows.filter((row) => row.reward !== null).length,
      censorCounts,
      costComplete: rows.filter(
        (row) => row.costMicros !== null && row.generationClosed,
      ).length,
      attemptCounts: rows.reduce((sum, row) => sum + row.attemptCount, 0),
      exposureDays: rows.length * 7,
      evidenceManifestHash: input.evidenceManifestHash,
    };
  };
  const groups = {
    control: summarize('control'),
    treatment: summarize('treatment'),
  };
  if (
    groups.control.matureEligible < 100 ||
    groups.treatment.matureEligible < 100
  )
    reasonCodes.push('insufficient_mature_outcomes');
  const weeklyBlocks = new Set(
    observations.map((row) =>
      Math.floor((new Date(row.assignedAt).getTime() - start) / (7 * 86400000)),
    ),
  );
  if (weeklyBlocks.size < 4) reasonCodes.push('insufficient_weekly_blocks');
  const censoring =
    groups.control.assigned && groups.treatment.assigned
      ? Math.abs(
          (groups.control.assigned - groups.control.matureEligible) /
            groups.control.assigned -
            (groups.treatment.assigned - groups.treatment.matureEligible) /
              groups.treatment.assigned,
        )
      : null;
  if (censoring !== null && censoring > 0.1)
    reasonCodes.push('differential_censoring');
  const point = metrics(observations),
    keys = Object.keys(point) as Array<keyof typeof point>;
  const samples = Object.fromEntries(
    keys.map((key) => [key, [] as number[]]),
  ) as Record<keyof typeof point, number[]>;
  const block = (row: LearningExperimentObservation) =>
    spec.kind === 'shared_stage'
      ? row.accountGroup
      : String(
          Math.floor(
            (new Date(row.assignedAt).getTime() - start) / (7 * 86400000),
          ),
        );
  const blocks = [...new Set(observations.map(block))].sort(),
    blocked = blocks.map((key) =>
      observations.filter((row) => block(row) === key),
    ),
    random = learningSeededRandom(input.specHash);
  for (let i = 0; i < 2000; i++) {
    const resampled = blocks.flatMap(
        () => blocked[Math.floor(random() * blocks.length)],
      ),
      values = metrics(resampled);
    for (const key of keys)
      if (values[key] !== null && Number.isFinite(values[key]))
        samples[key].push(values[key]);
  }
  const estimates: Record<string, LearningEstimateV1> = {};
  for (const key of keys) {
    const values = samples[key].sort((a, b) => a - b),
      value = point[key];
    const unavailableReasons =
      value === null
        ? [
            key === 'costRatio'
              ? 'incomplete_cost'
              : key === 'cadenceRatio'
                ? 'incomplete_cadence'
                : 'insufficient_observations',
          ]
        : values.length !== 2000
          ? ['numerical_instability']
          : [];
    estimates[key] = {
      value: unavailableReasons.length ? null : value,
      lower95: unavailableReasons.length ? null : values[49],
      upper95: unavailableReasons.length ? null : values[1949],
      unavailableReasons,
    };
    reasonCodes.push(...unavailableReasons);
  }
  const checks = [
    {
      name: 'primary_reward',
      estimate: 'primaryDifference',
      threshold: 0,
      lower: true,
      strict: true,
    },
    {
      name: 'approval_non_inferiority',
      estimate: 'approvalDifference',
      threshold: -0.05,
      lower: true,
      strict: false,
    },
    {
      name: 'publishability_non_inferiority',
      estimate: 'publishabilityDifference',
      threshold: -0.05,
      lower: true,
      strict: false,
    },
    {
      name: 'generation_cost',
      estimate: 'costRatio',
      threshold: 1.1,
      lower: false,
      strict: false,
    },
    {
      name: 'post_cadence',
      estimate: 'cadenceRatio',
      threshold: 1.1,
      lower: false,
      strict: false,
    },
  ];
  const evidenceIds = observations.flatMap((row) => row.evidenceIds);
  const guardrails: LearningEvaluationReportV1['guardrails'] = checks.map(
    (check) => {
      const estimate = estimates[check.estimate],
        value = check.lower ? estimate.lower95 : estimate.upper95;
      const status =
        value === null
          ? 'inconclusive'
          : check.lower
            ? (
                check.strict
                  ? value > check.threshold
                  : value >= check.threshold
              )
              ? 'passed'
              : 'failed'
            : value <= check.threshold
              ? 'passed'
              : 'failed';
      return {
        name: check.name,
        status,
        threshold: check.threshold,
        value,
        reasons: value === null ? estimate.unavailableReasons : [],
        evidenceIds,
      };
    },
  );
  const critical = observations.some((row) => row.criticalSafetyFailure);
  guardrails.push({
    name: 'critical_safety',
    status: critical ? 'failed' : 'passed',
    threshold: 0,
    value: critical ? 1 : 0,
    reasons: critical ? ['critical_safety_failure'] : [],
    evidenceIds,
  });
  if (critical) reasonCodes.push('critical_safety_failure');
  const status =
    guardrails.some((gate) => gate.status === 'failed') ||
    reasonCodes.some((code) =>
      [
        'differential_censoring',
        'invalid_observation',
        'invalid_dependency',
      ].includes(code),
    )
      ? 'failed'
      : reasonCodes.length ||
          guardrails.some((gate) => gate.status === 'inconclusive')
        ? 'inconclusive'
        : 'passed';
  return {
    schemaVersion: 1,
    kind: 'online',
    status,
    reasonCodes: [...new Set(reasonCodes)],
    experimentId: input.experimentId,
    specHash: input.specHash,
    candidateHash: spec.candidateHash,
    controlHash: spec.controlHash,
    stage: spec.stage,
    releaseRevision: spec.releaseRevision,
    analysisVersion: spec.analysisVersion,
    configVersion: spec.configVersion,
    cutoff: input.cutoff.toISOString(),
    createdAt: input.cutoff.toISOString(),
    synthetic: spec.synthetic,
    invalidationRevision: input.invalidationRevision,
    groups,
    estimates,
    guardrails,
  };
}
