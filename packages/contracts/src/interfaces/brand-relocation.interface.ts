import type { BrandRelocationStatus } from '../enums/brand-relocation-status.enum';

export interface IBrandRelocationSummary {
  workflowsMoved: number;
  membersSevered: number;
  schedulesHeld: number;
  schedulingPending: number;
  personaGrantsRevoked: number;
  personasSharingReset: number;
}

export interface IBrandRelocationOperation {
  id: string;
  brandId: string;
  organizationId: string;
  destinationOrganizationId: string;
  status: BrandRelocationStatus;
  summary?: IBrandRelocationSummary | null;
  error?: string | null;
}
