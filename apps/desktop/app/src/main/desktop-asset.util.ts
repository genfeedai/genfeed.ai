import type { IDesktopAsset } from '@genfeedai/desktop-contracts';

export type DesktopAssetRow = {
  brandId: string | null;
  cloudId: string | null;
  cloudObjectKey: string | null;
  createdAt: string;
  deletedAt: string | null;
  displayName: string;
  id: string;
  kind: string;
  localPath: string | null;
  mimeType: string;
  organizationId: string;
  origin: string;
  originalFileName: string;
  residency: string;
  sha256: string;
  sizeBytes: number;
  updatedAt: string;
  uploadPolicy: string;
  workspaceId: string | null;
};

export const toDesktopAsset = (row: DesktopAssetRow): IDesktopAsset => ({
  brandId: row.brandId ?? undefined,
  cloudId: row.cloudId ?? undefined,
  cloudObjectKey: row.cloudObjectKey ?? undefined,
  createdAt: row.createdAt,
  deletedAt: row.deletedAt ?? undefined,
  displayName: row.displayName,
  id: row.id,
  kind: row.kind as IDesktopAsset['kind'],
  localPath: row.localPath ?? undefined,
  mimeType: row.mimeType,
  organizationId: row.organizationId,
  origin: row.origin as IDesktopAsset['origin'],
  originalFileName: row.originalFileName,
  residency: row.residency as IDesktopAsset['residency'],
  sha256: row.sha256,
  sizeBytes: row.sizeBytes,
  updatedAt: row.updatedAt,
  uploadPolicy: row.uploadPolicy as IDesktopAsset['uploadPolicy'],
  workspaceId: row.workspaceId ?? undefined,
});
