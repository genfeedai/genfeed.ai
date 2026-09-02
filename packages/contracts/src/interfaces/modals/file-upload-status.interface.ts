import type { UploadStatus } from '../..';

export interface FileUploadStatus {
  file: File;
  id: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  result?: unknown;
}
