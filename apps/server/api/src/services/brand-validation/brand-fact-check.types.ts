import type {
  BrandFactClaimV1,
  BrandFactEvidenceV1,
} from '@genfeedai/contracts/api-types/contracts';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

/** Where the checked text came from: the draft itself, or text read out of a visual. */
export type BrandFactTextOrigin = BrandFactClaimV1['origin'];

export interface BrandFactCheckRequest {
  /** The validated snapshot; its approved facts are evidence and its scope is the only scope. */
  snapshot: BrandIdentitySnapshotV1;
  /** NFC, LF-normalized text to extract factual claims from. */
  text: string;
  origin: BrandFactTextOrigin;
}

export interface BrandKnowledgeVersionRef {
  sourceId: string;
  versionId: string;
  version: number;
}

/**
 * Why a fact check could not decide. None of them is a result: the report keeps
 * `system:factual_coverage` unknown and the draft goes to review.
 */
export type BrandFactCheckUnavailableReason =
  | 'fact_check_budget_exhausted'
  | 'fact_check_claim_limit'
  | 'fact_check_evidence_unavailable'
  | 'fact_check_invalid_output'
  | 'fact_check_scope_mismatch'
  | 'fact_check_text_too_long'
  | 'fact_check_unavailable';

/**
 * `checked`: claims were extracted (possibly none) and every one was judged
 * against the approved evidence.
 * `unavailable`: the extraction or the check could not complete.
 */
export type BrandFactCheckOutcome =
  | {
      status: 'checked';
      claims: BrandFactClaimV1[];
      /** The models that ran, as the provider reported them; empty when no model ran. */
      models: string[];
      knowledgeVersions: BrandKnowledgeVersionRef[];
    }
  | { status: 'unavailable'; reasonCode: BrandFactCheckUnavailableReason };

/** A caller's fact check, already bound to the actor it runs for. */
export type BrandFactCheck = (
  request: BrandFactCheckRequest,
) => Promise<BrandFactCheckOutcome>;

/** One passage of approved evidence, as the judge sees it and as a citation names it. */
export interface BrandFactEvidenceItem {
  id: string;
  origin: BrandFactEvidenceV1['origin'];
  text: string;
  ruleId?: string;
  sourceId?: string;
  versionId?: string;
  version?: number;
}
