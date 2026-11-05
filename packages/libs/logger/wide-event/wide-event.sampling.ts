import type { WideEventRecord } from './wide-event.interface';

/** Requests slower than this are always kept. */
export const WIDE_EVENT_SLOW_MS = 2_000;

/** Queue jobs legitimately run for minutes, so only extreme runs count as slow. */
export const WIDE_EVENT_SLOW_JOB_MS = 120_000;

/** Probes and floods: kept at the baseline rate even though they are 4xx. */
const BASELINE_CLIENT_ERROR_STATUSES = new Set([404, 429]);

/** Share of ordinary fast successes kept; every other event is kept in full. */
export const WIDE_EVENT_BASELINE_SAMPLE_RATE = 0.05;

const ALWAYS_KEPT_TIERS = new Set(['enterprise']);

function readAlwaysKept(event: WideEventRecord): boolean {
  const user = event.user as
    | { is_super_admin?: boolean; subscription_tier?: string }
    | undefined;

  const slowMs =
    event.kind === 'job' ? WIDE_EVENT_SLOW_JOB_MS : WIDE_EVENT_SLOW_MS;
  const isKeptClientError =
    event.outcome === 'client_error' &&
    !BASELINE_CLIENT_ERROR_STATUSES.has(event.status_code ?? 0);

  return (
    event.outcome === 'error' ||
    isKeptClientError ||
    (event.duration_ms ?? 0) > slowMs ||
    user?.is_super_admin === true ||
    ALWAYS_KEPT_TIERS.has(user?.subscription_tier ?? '')
  );
}

/**
 * Tail sampling: decided after the work finished, so the interesting events
 * (failures, caller errors other than 404/429, slow work, enterprise and admin
 * traffic) are
 * never dropped and only the boring baseline is thinned. Stamps `sample_rate`
 * so counts can be re-weighted (count / sample_rate) in queries.
 */
export function shouldKeepWideEvent(
  event: WideEventRecord,
  random: () => number = Math.random,
): boolean {
  if (readAlwaysKept(event)) {
    event.sample_rate = 1;
    return true;
  }

  if (random() < WIDE_EVENT_BASELINE_SAMPLE_RATE) {
    event.sample_rate = WIDE_EVENT_BASELINE_SAMPLE_RATE;
    return true;
  }

  return false;
}
