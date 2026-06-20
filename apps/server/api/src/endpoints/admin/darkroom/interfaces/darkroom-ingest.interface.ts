import type { ContentIntelligencePlatform } from '@genfeedai/enums';

export interface DarkroomIngestFailure {
  error: string;
  filename: string;
}

export interface DarkroomIngestResult {
  failed: DarkroomIngestFailure[];
  failedCount: number;
  uploadedCount: number;
}

export interface DarkroomSourceRecord extends Record<string, unknown> {
  enabled: boolean;
  handle: string;
  lastIngestedAt?: Date;
  platform: ContentIntelligencePlatform;
}
