import type { BrandOsRevisionStatus } from '../../enums/brand-os-revision.enum';
import type { IBrandKitDraft } from './brand-kit.interface';

export interface IBrandOsRevision {
  id: string;
  organizationId: string;
  brandId: string;
  version: number;
  exportSchemaVersion: string;
  status: `${BrandOsRevisionStatus}`;
  content: IBrandKitDraft;
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
}
