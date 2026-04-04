/**
 * File queue service interfaces
 * Used by FileQueueService for type-safe job processing
 */

import { JobState } from '@genfeedai/enums';

export interface IFileProcessingJob {
  id?: string;
  type: string;
  ingredientId: string;
  userId: string;
  clerkUserId?: string;
  organizationId: string;
  room?: string;
  priority?: number;
  params?: IFileProcessingParams;
  url?: string;
  filePath?: string;
  delay?: number;
  websocketUrl?: string;
  s3Bucket?: string;
}

export interface IFileProcessingParams {
  inputPath?: string;
  outputPath?: string;
  width?: number;
  height?: number;
  fps?: number;
  watermarkText?: string;
  frames?: IFrameInput[];
  musicId?: string;
  isDeleteOutputEnabled?: boolean;
  [key: string]: unknown;
}

export interface IFrameInput {
  url: string;
  duration?: number;
  order?: number;
}

export interface IJobResponse {
  jobId: string;
  status: string;
  type: string;
  ingredientId: string;
}

export interface IJobStatusResponse {
  jobId: string;
  state: JobState;
  progress?: number;
  result?: unknown;
  failedReason?: string;
  timestamp?: string;
}

export interface IQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface IYoutubeUploadData {
  postId: string;
  credentialId: string;
  ingredientId: string;
  userId: string;
  clerkUserId?: string;
  organizationId: string;
  brandId: string;
  room?: string;
  title: string;
  description: string;
  tags?: string[];
  status: string;
  scheduledDate?: Date;
  websocketUrl?: string;
}

export interface IYoutubeCredentialUpdate {
  accessToken: string;
  isConnected: boolean;
  refreshToken?: string;
  accessTokenExpiry?: Date;
}
