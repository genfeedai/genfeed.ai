import type {
  LearningAllocatedCostV1,
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
  costAllocations: readonly LearningAllocatedCostV1[] | null;
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
  const attempts = new Map<string, string>(),
    ledgers = new Map<string, string>();
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
    if (row.costAllocations !== null) {
      if (
        !Array.isArray(row.costAllocations) ||
        row.costAllocations.length !== row.attemptCount ||
        (!row.costAllocations.length && !row.generationClosed)
      )
        reject(index, 'costAllocations');
      const rowAttempts = new Set<string>(),
        rowLedgers = new Set<string>();
      const validId = (value: unknown) =>
        typeof value === 'string' && value.length > 0 && value.length <= 256;
      for (const [termIndex, term] of row.costAllocations.entries()) {
        const field = `costAllocations[${termIndex}]`;
        if (
          !term ||
          !validId(term.attemptId) ||
          !validId(term.ledgerId) ||
          !['llm', 'media'].includes(term.ledgerKind) ||
          typeof term.ledgerFingerprint !== 'string' ||
          !/^[0-9a-f]{64}$/.test(term.ledgerFingerprint) ||
          !Number.isSafeInteger(term.vendorCostMicros) ||
          term.vendorCostMicros < 0 ||
          !Array.isArray(term.opportunityIds) ||
          !term.opportunityIds.length ||
          term.opportunityIds.some((id: unknown) => !validId(id)) ||
          new Set(term.opportunityIds).size !== term.opportunityIds.length ||
          !term.opportunityIds.includes(row.id) ||
          term.opportunityIds.some(
            (id: string, i: number) =>
              i > 0 && term.opportunityIds[i - 1] >= id,
          )
        )
          reject(index, field);
        const ledgerIdentity = JSON.stringify([term.ledgerKind, term.ledgerId]);
        const manifest = JSON.stringify([
          term.ledgerKind,
          term.ledgerId,
          term.ledgerFingerprint,
          term.vendorCostMicros,
          term.opportunityIds,
        ]);
        if (
          rowAttempts.has(term.attemptId) ||
          rowLedgers.has(ledgerIdentity) ||
          (attempts.has(term.attemptId) &&
            attempts.get(term.attemptId) !== manifest) ||
          (ledgers.has(ledgerIdentity) &&
            ledgers.get(ledgerIdentity) !== term.attemptId)
        )
          reject(index, field);
        rowAttempts.add(term.attemptId);
        rowLedgers.add(ledgerIdentity);
        attempts.set(term.attemptId, manifest);
        ledgers.set(ledgerIdentity, term.attemptId);
      }
    }
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
interface LearningCostRational {
  numerator: bigint;
  denominator: bigint;
}
class LearningCostArithmeticError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}
function reduced(numerator: bigint, denominator: bigint): LearningCostRational {
  const factor = gcd(numerator, denominator);
  const value = {
    numerator: numerator / factor,
    denominator: denominator / factor,
  };
  if (
    value.numerator.toString(2).length > 4096 ||
    value.denominator.toString(2).length > 4096
  )
    throw new LearningCostArithmeticError('cost_precision_budget');
  return value;
}
function addCost(
  a: LearningCostRational,
  b: LearningCostRational,
): LearningCostRational {
  const factor = gcd(a.denominator, b.denominator);
  return reduced(
    a.numerator * (b.denominator / factor) +
      b.numerator * (a.denominator / factor),
    a.denominator * (b.denominator / factor),
  );
}
/** Pure binary presentation conversion; never changes an observed ledger amount. */
export function learningCostFractionValue(
  numerator: bigint,
  denominator: bigint,
): { value: number | null; reason: string | null } {
  try {
    if (numerator < 0n || denominator <= 0n)
      throw new LearningCostArithmeticError('non_finite_statistics');
    const rational = reduced(numerator, denominator);
    if (
      rational.numerator >
      BigInt(Number.MAX_SAFE_INTEGER) * rational.denominator
    )
      throw new LearningCostArithmeticError('non_finite_statistics');
    const scaled = rational.numerator << 52n;
    let quotient = scaled / rational.denominator;
    const remainder = scaled % rational.denominator;
    if (
      remainder * 2n > rational.denominator ||
      (remainder * 2n === rational.denominator && quotient % 2n !== 0n)
    )
      quotient++;
    const value = Number(quotient) * 2 ** -52;
    if (!Number.isFinite(value) || (rational.numerator > 0n && value === 0))
      throw new LearningCostArithmeticError('non_finite_statistics');
    return { value, reason: null };
  } catch (error) {
    if (!(error instanceof LearningCostArithmeticError)) throw error;
    return { value: null, reason: error.reason };
  }
}
function allocatedCost(
  terms: readonly LearningAllocatedCostV1[],
): LearningCostRational {
  return terms.reduce(
    (total, term) =>
      addCost(
        total,
        reduced(
          BigInt(term.vendorCostMicros),
          BigInt(term.opportunityIds.length),
        ),
      ),
    { numerator: 0n, denominator: 1n },
  );
}
export function learningAllocatedCostTotal(
  terms: readonly LearningAllocatedCostV1[],
): { value: number | null; reason: string | null } {
  try {
    const value = allocatedCost(terms);
    return learningCostFractionValue(value.numerator, value.denominator);
  } catch (error) {
    if (!(error instanceof LearningCostArithmeticError)) throw error;
    return { value: null, reason: error.reason };
  }
}
function groupCost(
  items: readonly LearningExperimentObservation[],
  reasons: Set<string>,
): LearningCostRational | null {
  if (
    !items.length ||
    items.some((row) => row.costAllocations === null || !row.generationClosed)
  ) {
    reasons.add('incomplete_cost');
    return null;
  }
  try {
    let total: LearningCostRational = { numerator: 0n, denominator: 1n };
    for (const row of items) {
      const cost = allocatedCost(row.costAllocations ?? []);
      if (cost.numerator > BigInt(Number.MAX_SAFE_INTEGER) * cost.denominator)
        throw new LearningCostArithmeticError('non_finite_statistics');
      // Resampled observations retain multiplicity and the original allocation denominator.
      total = addCost(total, cost);
    }
    if (total.numerator > BigInt(Number.MAX_SAFE_INTEGER) * total.denominator)
      throw new LearningCostArithmeticError('non_finite_statistics');
    const mean = reduced(
      total.numerator,
      total.denominator * BigInt(items.length),
    );
    const converted = learningCostFractionValue(
      mean.numerator,
      mean.denominator,
    );
    if (converted.reason) reasons.add(converted.reason);
    return converted.value === null ? null : mean;
  } catch (error) {
    if (!(error instanceof LearningCostArithmeticError)) throw error;
    reasons.add(error.reason);
    return null;
  }
}
function costRatioValue(
  treatment: LearningCostRational | null,
  control: LearningCostRational | null,
  reasons: Set<string>,
): number | null {
  if (treatment === null || control === null) return null;
  if (control.numerator === 0n) {
    return treatment.numerator === 0n ? 1 : null;
  }
  const converted = learningCostFractionValue(
    treatment.numerator * control.denominator,
    treatment.denominator * control.numerator,
  );
  if (converted.reason) reasons.add(converted.reason);
  return converted.value;
}
function metrics(
  rows: readonly LearningExperimentObservation[],
  costReasons: Set<string>,
) {
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
    cost: groupCost(items, costReasons),
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
  if (
    c.cost !== null &&
    c.cost.numerator === 0n &&
    t.cost !== null &&
    t.cost.numerator > 0n
  )
    costReasons.add('zero_control_cost');
  return {
    controlMean: c.reward,
    treatmentMean: t.reward,
    primaryDifference: difference(t.reward, c.reward),
    approvalDifference: difference(t.approval, c.approval),
    publishabilityDifference: difference(t.publishability, c.publishability),
    costRatio: costRatioValue(t.cost, c.cost, costReasons),
    cadenceRatio: ratio(t.cadence, c.cadence),
  };
}
export function buildLearningExperimentReport(
  input: LearningExperimentReportInput,
): LearningEvaluationReportV1 {
  if (
    !Number.isSafeInteger(input.invalidationRevision) ||
    input.invalidationRevision < 0
  )
    throw new LearningEvidenceValidationError('invalidationRevision');
  if (!Number.isFinite(input.cutoff.getTime()))
    throw new LearningEvidenceValidationError('cutoff');
  for (const field of ['startAt', 'endAt'] as const)
    if (
      typeof input.spec[field] !== 'string' ||
      !Number.isFinite(new Date(input.spec[field]).getTime())
    )
      throw new LearningEvidenceValidationError(`spec.${field}`);
  if (new Date(input.spec.endAt) <= new Date(input.spec.startAt))
    throw new LearningEvidenceValidationError('spec.endAt');
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
        (row) => row.costAllocations !== null && row.generationClosed,
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
  const costReasons = new Set<string>();
  const point = metrics(observations, costReasons),
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
      values = metrics(resampled, costReasons);
    for (const key of keys)
      if (values[key] !== null && Number.isFinite(values[key]))
        samples[key].push(values[key]);
  }
  const estimates: Record<string, LearningEstimateV1> = {};
  for (const key of keys) {
    const values = samples[key].sort((a, b) => a - b),
      value = point[key];
    const unavailableReasons =
      key === 'costRatio' && costReasons.size
        ? [...costReasons]
        : value === null
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
        reasons:
          value === null
            ? estimate.unavailableReasons
            : check.name === 'generation_cost' &&
                observations.every(
                  (row) =>
                    row.costAllocations !== null &&
                    row.generationClosed &&
                    row.costAllocations.every(
                      (term) => term.vendorCostMicros === 0,
                    ),
                )
              ? ['zero_basis']
              : [],
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
