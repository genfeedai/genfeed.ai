import type { IActivity } from '../index';
import type { IGenerationItem } from './generation.interface';

export interface BackgroundTaskUpdateEvent {
  taskId: string;
  activityId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  resultId?: string;
  resultType?: 'VIDEO' | 'IMAGE' | 'MUSIC';
  error?: string;
  label?: string;
}

export type UnifiedActivityItem = {
  id: string;
  timestamp: Date;
  type: 'generation' | 'activity' | 'background-task';
  data: IGenerationItem | IActivity;
};
