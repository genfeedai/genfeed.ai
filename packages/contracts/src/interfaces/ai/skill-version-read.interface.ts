/** Immutable versions-read V1. Internal evidence must never enter wire attributes. */
export interface SkillVersionListQueryV1 {
  limit?: number;
  beforeVersionNumber?: number;
}
export interface SkillVersionMetadataAttributesV1 {
  versionNumber: number;
  createdAt: string;
  contentHash: string;
}
export interface SkillVersionReadAttributesV1
  extends SkillVersionMetadataAttributesV1 {
  instructionText: string;
}
export interface SkillVersionMetadataV1
  extends SkillVersionMetadataAttributesV1 {
  id: string;
}
export interface SkillVersionReadV1 extends SkillVersionMetadataV1 {
  instructionText: string;
}
export interface SkillVersionReadPageV1 {
  items: SkillVersionMetadataV1[];
  limit: number;
  hasMore: boolean;
  nextCursor: number | null;
}
export interface SkillVersionCursorV1 {
  hasMore: boolean;
  limit: number;
  nextCursor: number | null;
}
export interface SkillVersionCollectionLinksV1 {
  self: string;
  cursor: SkillVersionCursorV1;
}
export interface SkillVersionDetailLinksV1 {
  self: string;
}
export interface SkillVersionMetadataResourceV1 {
  type: 'skill-version';
  id: string;
  attributes: SkillVersionMetadataAttributesV1;
}
export interface SkillVersionReadResourceV1 {
  type: 'skill-version';
  id: string;
  attributes: SkillVersionReadAttributesV1;
}
export interface SkillVersionCollectionResponseV1 {
  data: SkillVersionMetadataResourceV1[];
  links: SkillVersionCollectionLinksV1;
}
export interface SkillVersionResponseV1 {
  data: SkillVersionReadResourceV1;
  links: SkillVersionDetailLinksV1;
}
export interface SkillVersionReadParentV1 {
  id: string;
  ownerKind: string | null;
  ownerUserId: string | null;
  organizationId: string | null;
  brandId: string | null;
}
export interface SkillVersionSourceEvidenceV1 {
  id: string;
  skillId: string;
  versionNumber: number;
  format: string;
  payload: unknown;
  instructionText: string;
  instructionSourceField: string | null;
  instructionUsable: boolean;
  contentHash: string;
  instructionHash: string;
  createdById: string | null;
  createdAt: Date;
}
