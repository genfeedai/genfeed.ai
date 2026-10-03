export interface MediaDeliverySource {
  id: string;
  organizationId: string | null;
  userId: string | null;
  brandId: string | null;
  metadataId: string | null;
  s3Key: string | null;
  category: string;
  scope: string;
  version: number;
  generationCompletedAt: Date | null;
  fileSize: number | null;
  mimeType: string | null;
  isPublic: boolean;
}
