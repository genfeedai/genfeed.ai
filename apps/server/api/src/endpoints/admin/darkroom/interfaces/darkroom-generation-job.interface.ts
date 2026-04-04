export type DarkroomGenerationJobStatus =
  | 'queued'
  | 'processing'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface DarkroomGenerationJob {
  jobId: string;
  status: DarkroomGenerationJobStatus;
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
