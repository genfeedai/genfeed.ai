/**
 * While a fal job runs, the placeholder's `externalId` holds this reference
 * instead of an output URL, so a later request (a cancel, possibly on another
 * task) can find the queue request. The adapter replaces it with the output
 * URL when the job completes.
 *
 * fal addresses a request by endpoint and request id, so both travel together:
 * `fal-request:<endpoint>:<requestId>`. An endpoint never contains `:`.
 */
const FAL_REQUEST_REF_PREFIX = 'fal-request:';
const BATCH_SUFFIX_PATTERN = /_\d+$/;

export interface FalRequestRef {
  endpoint: string;
  requestId: string;
}

/** Called once fal accepts a job, with what a later cancel needs. */
export type FalRequestEnqueued = (ref: FalRequestRef) => Promise<void> | void;

export function encodeFalRequestRef(ref: FalRequestRef): string {
  return `${FAL_REQUEST_REF_PREFIX}${ref.endpoint}:${ref.requestId}`;
}

/** Reads a reference back, ignoring a batch suffix (`_<index>`) and anything else. */
export function parseFalRequestRef(
  externalId: string | null | undefined,
): FalRequestRef | null {
  if (!externalId?.startsWith(FAL_REQUEST_REF_PREFIX)) return null;
  const body = externalId
    .slice(FAL_REQUEST_REF_PREFIX.length)
    .replace(BATCH_SUFFIX_PATTERN, '');
  const separator = body.lastIndexOf(':');
  if (separator <= 0 || separator === body.length - 1) return null;
  return {
    endpoint: body.slice(0, separator),
    requestId: body.slice(separator + 1),
  };
}

/**
 * Trailing arguments for `FalService.generateImage` / `generateVideo`: the
 * enqueue hook when a pipeline stores the reference, nothing otherwise.
 */
export function falEnqueueArgs(
  store?: (externalRef: string) => Promise<void>,
): [] | [FalRequestEnqueued] {
  return store ? [(ref) => store(encodeFalRequestRef(ref))] : [];
}
