import type { BrandOsRevisionStatus } from '../../enums/brand-os-revision.enum';
import type { IBrandKitDraft } from './brand-kit.interface';

/** One Brand Kit field and how many characters of the required text context it fills. */
export interface IBrandKitRequiredTextContextField {
  /** Brand Kit field key, or the section header for rules sections. */
  field: string;
  characters: number;
}

/**
 * What every text generation must carry whole (identity, writing voice and
 * required rules), counted from the saved revision against the shared budget.
 */
export interface IBrandKitRequiredTextContext {
  requiredCharacters: number;
  maxCharacters: number;
  overflowCharacters: number;
  /** Largest first. */
  fields: IBrandKitRequiredTextContextField[];
}

export interface IBrandOsRevision {
  id: string;
  organizationId: string;
  brandId: string;
  version: number;
  exportSchemaVersion: string;
  status: `${BrandOsRevisionStatus}`;
  content: IBrandKitDraft;
  /** Absent for a superseded revision and when the kit's identity cannot be read. */
  requiredTextContext?: IBrandKitRequiredTextContext;
  generationRulesReviewHash?: string;
  generationRulesReviewCandidateHash?: string;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IBrandOsRevisionUpdateRequest {
  content: IBrandKitDraft;
  updatedAt: string;
}

export interface IBrandOsRevisionApproveRequest {
  updatedAt: string;
  reviewedGenerationRulesHash?: string;
}
