export interface VideoCreationParams {
  title: string;
  description: string;
  style?: string;
  duration?: number;
  voiceOver?: {
    enabled: boolean;
    voice?: string;
  };
}

export interface VideoResponse {
  id: string;
  status: string;
  estimatedCompletion: string;
  title?: string;
  createdAt?: string;
  duration?: number;
  url?: string;
  views?: number;
}

export interface VideoStatus {
  status: string;
  progress: number;
  message?: string;
  url?: string;
}
