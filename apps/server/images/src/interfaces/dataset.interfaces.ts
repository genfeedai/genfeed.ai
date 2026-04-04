export interface DatasetSyncRequest {
  s3Keys: string[];
  bucket?: string;
}

export interface DatasetInfo {
  slug: string;
  imageCount: number;
  images: string[];
  path: string;
}

export interface DatasetSyncResult {
  slug: string;
  downloaded: number;
  failed: number;
  errors: string[];
  path: string;
}
