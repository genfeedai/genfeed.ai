export interface VoiceCloneUploadRequest {
  voiceId: string;
  localPath: string;
}

export interface VoiceCloneUploadResult {
  voiceId: string;
  s3Key: string;
  uploaded: boolean;
}

export interface VoiceCloneInfo {
  voiceId: string;
  filename: string;
  source: 'local' | 's3';
  path?: string;
  s3Key?: string;
  sizeBytes?: number;
  lastModified?: string;
}

export interface VoiceCloneListResult {
  clones: VoiceCloneInfo[];
  total: number;
}
