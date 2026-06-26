export type AdminFleetGenerationJobStatus =
  | 'queued'
  | 'processing'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface AdminFleetGenerationJob {
  jobId: string;
  status: AdminFleetGenerationJobStatus;
  stage: string;
  progress: number;
  personaSlug: string;
  prompt: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  ingredientId?: string;
  cdnUrl?: string;
  error?: string;
}
