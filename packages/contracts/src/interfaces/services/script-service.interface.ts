export interface IScriptIdeaRequest {
  topic?: string;
  style?: string;
  tone?: string;
  length?: number;
  keywords?: string[];
  targetAudience?: string;
  metadata?: Record<string, unknown>;
}

export interface IScriptIdeaResponse {
  id: string;
  title: string;
  description: string;
  outline?: string[];
  estimatedDuration?: number;
  suggestedScenes?: number;
  metadata?: Record<string, unknown>;
}
