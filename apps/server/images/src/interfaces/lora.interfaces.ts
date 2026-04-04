export interface LoraUploadRequest {
  localPath: string;
  loraName: string;
}

export interface LoraUploadResult {
  loraName: string;
  s3Key: string;
  uploaded: boolean;
}

export interface LoraInfo {
  name: string;
  filename: string;
  source: 'local' | 's3';
  path?: string;
  s3Key?: string;
  sizeBytes?: number;
  lastModified?: string;
}

export interface LoraListResult {
  loras: LoraInfo[];
  total: number;
}
