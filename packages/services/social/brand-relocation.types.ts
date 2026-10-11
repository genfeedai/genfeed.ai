import type { Brand } from '@genfeedai/models/organization/brand.model';

/**
 * Counts returned by the relocation preview endpoint.
 */
export interface IBrandRelocationCounts {
  soleBrandWorkflows: number;
  staleMembers: number;
  schedulesToHold: number;
  personasToReset: number;
}

/**
 * A workflow schedule the move pauses. The cron expression and timezone are
 * kept; the person who saved it is not carried over, so someone in the new
 * organization saves it again to resume it.
 */
export interface IBrandRelocationHeldSchedule {
  id: string;
  label: string | null;
  schedule: string;
  timezone: string | null;
}

/**
 * A character the moving brand owns that is shared beyond that brand. The move
 * resets it to the owning brand only and clears its brand list, because the
 * sharing was decided in the organization it leaves.
 */
export interface IBrandRelocationSharedPersona {
  id: string;
  label: string;
  handle: string | null;
  /** `ALL_BRANDS` or `SELECTED_BRANDS` (a leftover brand list on an owning-brand character is also reset). */
  availabilityMode: string;
  /** How many brands the character listed (zero for an every-brand character). */
  availableBrandCount: number;
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
  /** The characters that will be limited to this brand only. */
  personasToReset: IBrandRelocationSharedPersona[];
  /** The enabled schedules that will be paused by the move. */
  schedulesToHold: IBrandRelocationHeldSchedule[];
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
  membersSevered: number;
  /** Enabled schedules paused until someone saves them again. */
  schedulesHeld: number;
  /** Held schedules whose queued job could not be confirmed removed. */
  schedulingPending: number;
  /** Character grants revoked because their character changed organization. */
  personaGrantsRevoked: number;
  /** Shared characters reset to their owning brand only. */
  personasSharingReset: number;
}

/**
 * Combined result of the relocation PATCH: the updated brand entity plus
 * the relocation summary from the response's top-level `meta`.
 */
export interface IBrandRelocationResult {
  brand: Brand;
  summary: IBrandRelocationSummary;
}
