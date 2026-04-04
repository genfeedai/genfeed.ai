export interface TTSGenerateRequest {
  text: string;
  voiceId?: string;
  language?: string;
  speed?: number;
}

export interface TTSJob {
  jobId: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  params: Record<string, unknown>;
  audioUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface VoiceProfile {
  handle: string;
  label: string;
  audioUrl: string;
  status: 'cloning' | 'ready' | 'failed';
  createdAt: string;
}
