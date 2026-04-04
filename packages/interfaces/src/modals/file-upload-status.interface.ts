import type { UploadStatus } from '@genfeedai/enums';

export interface FileUploadStatus {
  file: File;
  id: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  result?: unknown;
}
