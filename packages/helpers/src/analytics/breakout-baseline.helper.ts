import type {
  BreakoutBaselineEvaluation,
  BreakoutBaselineInput,
  BreakoutEvidenceExclusion,
  BreakoutObservation,
} from '@genfeedai/contracts/interfaces';

const SCOPE_FIELDS = [
  'organizationId',
  'brandId',
  'credentialId',
  'platform',
  'format',
] as const;
const MAX_OBSERVATIONS = 2000;
const MAX_COLLECTION_MS = 5 * 60 * 1000;

function measuredAt(row: Readonly<BreakoutObservation>): number {
  return row.providerAsOfMs ?? (row.requestStartedAtMs + row.receivedAtMs) / 2;
}
function timeBasis(
  row: Readonly<BreakoutObservation>,
): BreakoutBaselineEvaluation['timeBasis'] {
  return row.providerAsOfMs === null ? 'collection_interval' : 'provider_as_of';
}
function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}
function reasons(
  row: Readonly<BreakoutObservation>,
  input: BreakoutBaselineInput,
): BreakoutEvidenceExclusion[] {
  const result: BreakoutEvidenceExclusion[] = [];
  if (SCOPE_FIELDS.some((key) => row[key] !== input.scope[key]))
    result.push('foreign_scope');
  if (row.isDeleted) result.push('deleted');
  if (row.isPinned) result.push('pinned');
  if (row.isPromoted) result.push('promoted');
  if (row.isResponse) result.push('response');
  if (
    !row.sourceValid ||
    !row.id.trim() ||
    !row.sourceFingerprint.trim() ||
    !row.contentDigest.trim() ||
    !row.logicalPostId.trim()
  )
    result.push('unverified_source');
  const timestamps = [
    row.publishedAtMs,
    row.requestStartedAtMs,
    row.receivedAtMs,
  ];
  if (row.providerAsOfMs !== null) timestamps.push(row.providerAsOfMs);
  if (
    timestamps.some((value) => !validTime(value)) ||
    row.requestStartedAtMs < row.publishedAtMs ||
    row.receivedAtMs < row.requestStartedAtMs ||
    row.receivedAtMs - row.requestStartedAtMs > MAX_COLLECTION_MS ||
    measuredAt(row) < row.publishedAtMs ||
    measuredAt(row) > row.receivedAtMs
  )
    result.push('invalid_collection');
  if (row.receivedAtMs > input.nowMs) result.push('future_observation');
  const lower = input.options.windowAgeMs - input.options.toleranceMs;
  const upper = input.options.windowAgeMs + input.options.toleranceMs;
  const ageStart =
    (row.providerAsOfMs ?? row.requestStartedAtMs) - row.publishedAtMs;
  const ageEnd = (row.providerAsOfMs ?? row.receivedAtMs) - row.publishedAtMs;
  if (ageStart < lower || ageEnd > upper) result.push('incomparable_age');
  const metric = row.exposures[input.metric];
  if (metric?.availability !== 'observed') result.push('unavailable_metric');
  if (
    !metric ||
    metric.value === null ||
    !Number.isSafeInteger(metric.value) ||
    metric.value < 0 ||
    !metric.source.trim()
  )
    result.push('invalid_metric');
  if (metric?.scope !== 'organic') result.push('non_organic_metric');
  return result;
}
function validateInput(input: BreakoutBaselineInput): void {
  const {
    windowAgeMs,
    toleranceMs,
    windowSize,
    minimumSampleSize,
    breakoutThreshold,
  } = input.options;
  if (
    !validTime(input.nowMs) ||
    SCOPE_FIELDS.some((key) => !input.scope[key].trim())
  )
    throw new RangeError('Breakout scope and evaluation time are required');
  if (
    !Number.isSafeInteger(windowAgeMs) ||
    windowAgeMs <= 0 ||
    !Number.isSafeInteger(toleranceMs) ||
    toleranceMs < 0 ||
    toleranceMs >= windowAgeMs ||
    !Number.isSafeInteger(windowAgeMs + toleranceMs)
  )
    throw new RangeError(
      'Breakout age window and tolerance must be bounded positive durations',
    );
  if (
    !Number.isInteger(windowSize) ||
    windowSize < 5 ||
    windowSize > 50 ||
    !Number.isInteger(minimumSampleSize) ||
    minimumSampleSize < 5 ||
    minimumSampleSize > windowSize
  )
    throw new RangeError('Breakout baseline requires 5–50 distinct posts');
  if (!Number.isFinite(breakoutThreshold) || breakoutThreshold < 10)
    throw new RangeError('Breakout threshold must be finite and at least ten');
}

/** Compare prospective evidence without inferring early history from cumulative daily rows. */
export function evaluateComparableBreakout(
  input: BreakoutBaselineInput,
): BreakoutBaselineEvaluation {
  validateInput(input);
  const result: BreakoutBaselineEvaluation = {
    version: 1,
    status: 'insufficient_data',
    metric: input.metric,
    source: input.target.exposures[input.metric]?.source ?? null,
    timeBasis: timeBasis(input.target),
    targetObservationId: input.target.id,
    targetValue: null,
    median: null,
    ratio: null,
    sampleSize: 0,
    options: { ...input.options },
    contributors: [],
    exclusions: [],
  };
  if (input.truncated || input.observations.length > MAX_OBSERVATIONS)
    return { ...result, status: 'truncated' };
  const invalid = reasons(input.target, input);
  if (invalid.length)
    return {
      ...result,
      status: 'invalid_target',
      exclusions: [{ observationId: input.target.id, reasons: invalid }],
    };
  result.targetValue = input.target.exposures[input.metric]?.value ?? null;
  const ids = new Set<string>();
  const candidates: Readonly<BreakoutObservation>[] = [];
  for (const row of input.observations) {
    if (!row.id.trim() || ids.has(row.id))
      throw new RangeError('Breakout observation identities must be unique');
    ids.add(row.id);
    const excluded = reasons(row, input);
    if (row.logicalPostId === input.target.logicalPostId)
      excluded.push('source_post');
    if (row.publishedAtMs >= input.target.publishedAtMs)
      excluded.push('not_prior_post');
    if (row.receivedAtMs > input.target.receivedAtMs)
      excluded.push('future_observation');
    if (row.exposures[input.metric]?.source !== result.source)
      excluded.push('different_metric_source');
    if (timeBasis(row) !== result.timeBasis)
      excluded.push('different_time_basis');
    if (excluded.length)
      result.exclusions.push({
        observationId: row.id,
        reasons: [...new Set(excluded)],
      });
    else candidates.push(row);
  }
  candidates.sort(
    (left, right) =>
      right.publishedAtMs - left.publishedAtMs ||
      Math.abs(
        measuredAt(left) - left.publishedAtMs - input.options.windowAgeMs,
      ) -
        Math.abs(
          measuredAt(right) - right.publishedAtMs - input.options.windowAgeMs,
        ) ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const posts = new Set<string>();
  for (const row of candidates) {
    const reason = posts.has(row.logicalPostId)
      ? 'duplicate_post'
      : result.contributors.length >= input.options.windowSize
        ? 'outside_window'
        : null;
    if (reason) {
      result.exclusions.push({ observationId: row.id, reasons: [reason] });
      continue;
    }
    posts.add(row.logicalPostId);
    const value = row.exposures[input.metric]?.value;
    if (value === undefined || value === null)
      throw new RangeError('Validated breakout metric became unavailable');
    result.contributors.push({
      observationId: row.id,
      logicalPostId: row.logicalPostId,
      sourceFingerprint: row.sourceFingerprint,
      value,
      ageMs: measuredAt(row) - row.publishedAtMs,
      isPinnedUnknown: row.isPinned === null,
      isPromotedUnknown: row.isPromoted === null,
    });
  }
  result.sampleSize = result.contributors.length;
  if (result.sampleSize < input.options.minimumSampleSize) return result;
  const values = result.contributors
    .map((row) => row.value)
    .sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  result.median =
    values.length % 2
      ? values[middle]
      : values[middle - 1] / 2 + values[middle] / 2;
  if (result.median === 0) return { ...result, status: 'zero_baseline' };
  result.ratio = (result.targetValue ?? 0) / result.median;
  result.status =
    result.ratio >= input.options.breakoutThreshold
      ? 'breakout'
      : 'below_threshold';
  return result;
}
