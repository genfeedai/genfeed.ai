export type TrainingStage =
  | 'preprocessing'
  | 'training'
  | 'postprocessing'
  | 'uploading'
  | 'completed'
  | 'failed';

export type TrainingStatus = 'running' | 'completed' | 'failed';

export interface TrainingRequest {
  personaSlug: string;
  triggerWord: string;
  loraName: string;
  loraRank?: number;
  steps?: number;
  learningRate?: number;
}

export interface TrainingJob {
  jobId: string;
  status: TrainingStatus;
  stage: TrainingStage;
  progress: number;
  personaSlug: string;
  loraName: string;
  triggerWord: string;
  params: TrainingParams;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TrainingParams {
  personaSlug: string;
  triggerWord: string;
  loraName: string;
  loraRank: number;
  steps: number;
  learningRate: number;
}

export interface TrainingJobSummary {
  jobId: string;
  status: TrainingStatus;
  stage: TrainingStage;
  progress: number;
  personaSlug: string;
  loraName: string;
  createdAt: string;
}
