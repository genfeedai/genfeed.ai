export interface VoiceDatasetSyncRequest {
  s3Keys: string[];
  bucket?: string;
}

export interface VoiceDatasetInfo {
  voiceId: string;
  sampleCount: number;
  totalDurationMs: number;
  samples: string[];
  path: string;
}

export interface VoiceDatasetSyncResult {
  voiceId: string;
  downloaded: number;
  failed: number;
  errors: string[];
  path: string;
}
