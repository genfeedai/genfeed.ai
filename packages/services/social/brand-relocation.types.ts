import type { Brand } from '@genfeedai/models/organization/brand.model';

/**
 * Counts returned by the relocation preview endpoint.
 */
export interface IBrandRelocationCounts {
  soleBrandWorkflows: number;
  staleMembers: number;
}

export interface IBrandRelocationMovingResource {
  resource: string;
  label: string;
  count: number;
}

/**
 * Response shape for `GET /brands/:id/relocation-preview`.
 *
 * `movingResources` lists non-zero resource counts whose organization scope
 * will be rewritten with the brand.
 */
export interface IBrandRelocationPreview {
  counts: IBrandRelocationCounts;
  movingResources: IBrandRelocationMovingResource[];
}

/**
 * Request body for the relocation-specific `PATCH /brands/:id` call.
 */
export type IBrandRelocationPatchBody = Record<string, unknown> & {
  organizationId: string;
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
