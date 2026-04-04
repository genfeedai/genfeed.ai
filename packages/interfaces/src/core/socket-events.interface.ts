import { CrudAction, UploadStatus } from '@genfeedai/enums';

export interface ISocketEventData<T = unknown> {
  event: string;
  timestamp: number;
  data: T;
}

export interface ISocketError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface IPromptEventData {
  promptId: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
}

export interface IUploadProgressData {
  fileId: string;
  fileName: string;
  progress: number;
  status: UploadStatus.UPLOADING | UploadStatus.COMPLETED | UploadStatus.FAILED;
  error?: string;
  loaded?: number;
  total?: number;
}

export interface IMediaEventData {
  mediaId: string;
  category: 'image' | 'video' | 'audio';
  status: 'queued' | 'processing' | 'success' | 'completed' | 'failed';
  result?: {
    url?: string;
    thumbnailUrl?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  };
  error?: string;
  progress?: {
    percent: number;
    eta?: number;
    stage?: string;
  };
}

export interface IOrganizationEventData {
  organization: string;
  action: CrudAction;
  changes?: Record<string, unknown>;
  timestamp: number;
}

export interface ICreditsEventData {
  balance?: number;
}

export interface IStepsEventData {
  stepId: string;
  workflowId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  label: string;
  description?: string;
  result?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export type ISocketEventHandler<T = unknown> = (data: T) => void;
export type ISocketErrorHandler = (error: ISocketError) => void;

export interface ISocketListener<T = unknown> {
  event: string;
  handler: ISocketEventHandler<T>;
}
