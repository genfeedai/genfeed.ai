export interface GenerateVideoRequest {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  sourceImageUrl?: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export interface VideoGenerationJob {
  jobId: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  params: Record<string, unknown>;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ComfyUIPromptResponse {
  prompt_id: string;
}

export interface ComfyUIOutputImage {
  filename: string;
  type: string;
}

export interface ComfyUIHistoryEntry {
  status: {
    completed?: boolean;
    status_str?: string;
  };
  outputs: Record<
    string,
    {
      images?: ComfyUIOutputImage[];
    }
  >;
}

export interface Wan22I2VParams {
  prompt: string;
  negativePrompt: string;
  prefix: string;
  seed: number;
  imageFilename: string;
  numFrames?: number;
  fps?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  highNoiseUnet?: string;
  lowNoiseUnet?: string;
  clip?: string;
  vae?: string;
}
