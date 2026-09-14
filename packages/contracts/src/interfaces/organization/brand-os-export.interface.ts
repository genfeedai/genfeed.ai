export type BrandOsExportVisibility = 'private' | 'public';
export type BrandOsExportEvidence =
  | 'extracted'
  | 'inferred'
  | 'accepted-candidate'
  | 'missing';
export interface IBrandOsExportState {
  id: string;
  brandId: string;
  state: 'unavailable' | 'private' | 'published' | 'revoked';
  schemaVersion: '1';
  revisionId: string | null;
  digest: string | null;
  generatedAt: string | null;
  publishedRevisionId: string | null;
  publishedAt: string | null;
  publicUrl: string | null;
  revisionUrl: string | null;
  canPublish: boolean;
}
export interface IBrandOsDesignExportInput {
  brandId: string;
  revisionId: string;
  approvedAt: string;
  content: unknown;
  visibility: BrandOsExportVisibility;
}
export interface IBrandOsDesignArtifact {
  markdown: string;
  digest: string;
  revisionId: string;
  schemaVersion: '1';
  generatedAt: string;
}
