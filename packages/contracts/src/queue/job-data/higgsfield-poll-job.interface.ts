/**
 * Higgsfield poll queue contract.
 *
 * A Higgsfield video request is polled from a durable job rather than from the
 * request that submitted it, so a restart after the provider accepted (and
 * billed) the job resumes it instead of losing the output.
 */
export const HIGGSFIELD_POLL_DELAY_MS = 15_000;
/** 60 attempts at 15 seconds: the 15 minute ceiling the in-process wait had. */
export const HIGGSFIELD_POLL_MAX_ATTEMPTS = 60;

export interface HiggsFieldPollJobData {
  /** Attempt counter; the job reschedules itself with this incremented. */
  attempt: number;
  /** Provider request id returned when Higgsfield accepted the job. */
  externalId: string;
  ingredientId: string;
  /** Organization whose Higgsfield credentials accepted the request. */
  organizationId: string;
}
