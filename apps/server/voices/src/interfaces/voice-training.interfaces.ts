export type VoiceTrainingStage =
  | 'preprocessing'
  | 'training'
  | 'postprocessing'
  | 'completed'
  | 'failed';

export type VoiceTrainingStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface VoiceTrainingRequest {
  voiceId: string;
  sampleRate?: number;
  epochs?: number;
  batchSize?: number;
}

export interface VoiceTrainingJob {
  jobId: string;
  status: VoiceTrainingStatus;
  stage: VoiceTrainingStage;
  progress: number;
  voiceId: string;
  params: VoiceTrainingParams;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface VoiceTrainingParams {
  voiceId: string;
  sampleRate: number;
  epochs: number;
  batchSize: number;
}

export interface VoiceTrainingJobSummary {
  jobId: string;
  status: VoiceTrainingStatus;
  stage: VoiceTrainingStage;
  progress: number;
  voiceId: string;
  createdAt: string;
}
