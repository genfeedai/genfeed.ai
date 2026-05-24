import type { AdBulkUploadJob } from '@genfeedai/prisma';

export type BulkUploadStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial';

export interface BulkUploadError {
  message: string;
  permutationIndex: number;
  timestamp: Date | string;
}

export type AdBulkUploadJobDocument = Omit<AdBulkUploadJob, 'data'> & {
  _id: string;
  organization?: string;
  brand?: string;
  credential?: string;
  status?: BulkUploadStatus;
  totalPermutations?: number;
  completedPermutations?: number;
  failedPermutations?: number;
  uploadErrors?: BulkUploadError[];
  data: Record<string, unknown>;
};

export type CreativeSource =
  | 'content-library'
  | 'ai-generated'
  | 'manual-upload';
