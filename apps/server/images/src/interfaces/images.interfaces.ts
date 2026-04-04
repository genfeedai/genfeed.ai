export interface GenerateImageRequest {
  [key: string]: unknown;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  width?: number;
  height?: number;
  seed?: number;
  lora?: string;
}

export interface GeneratePulidRequest {
  [key: string]: unknown;
  prompt: string;
  referenceImageUrl: string;
  model?: string;
  width?: number;
  height?: number;
}

export interface GenerationJob {
  jobId: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  params: Record<string, unknown>;
  resultUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}
