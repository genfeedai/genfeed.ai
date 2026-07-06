import type { Brand } from '@genfeedai/models/organization/brand.model';

/**
 * Counts returned by the relocation preview endpoint, describing the
 * clone/severance impact of moving a brand to a destination organization.
 */
export interface IBrandRelocationCounts {
  sharedWorkflows: number;
  soleBrandWorkflows: number;
  staleMembers: number;
}

/**
 * Response shape for `GET /brands/:id/relocation-preview`.
 *
 * `ackToken` is `null` when the move has no clone impact (no shared
 * workflows attached to the brand) and therefore doesn't require an ack.
 */
export interface IBrandRelocationPreview {
  ackToken: string | null;
  counts: IBrandRelocationCounts;
}

/**
 * Request body for the relocation-specific `PATCH /brands/:id` call.
 * `relocationAck` must echo the `ackToken` from the preview whenever
 * `counts.sharedWorkflows > 0` — the server returns 409 otherwise.
 */
export type IBrandRelocationPatchBody = Record<string, unknown> & {
  organizationId: string;
  relocationAck?: string;
};

/**
 * Top-level JSON:API `meta` object returned by the relocation PATCH.
 * The generic `BaseService.patch` maps the JSON:API document to an
 * entity and drops this — relocation callers must read it directly
 * from the raw response.
 */
export interface IBrandRelocationSummary {
  workflowsMoved: number;
  workflowsClonedActive: number;
  workflowsClonedPaused: number;
  membersSevered: number;
  schedulingPending: number;
}

/**
 * Combined result of the relocation PATCH: the updated brand entity plus
 * the relocation summary from the response's top-level `meta`.
 */
export interface IBrandRelocationResult {
  brand: Brand;
  summary: IBrandRelocationSummary;
}
