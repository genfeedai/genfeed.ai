import type { ContentIntelligencePlatform } from '@genfeedai/enums';

export interface AdminFleetIngestFailure {
  error: string;
  filename: string;
}

export interface AdminFleetIngest {
  failed: AdminFleetIngestFailure[];
  failedCount: number;
  uploadedCount: number;
}

export interface AdminFleetSourceRecord extends Record<string, unknown> {
  enabled: boolean;
  handle: string;
  lastIngestedAt?: Date;
  platform: ContentIntelligencePlatform;
}
