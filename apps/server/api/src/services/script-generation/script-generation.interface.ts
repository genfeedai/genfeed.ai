export interface ScriptGenerationRequest {
  brandId: string;
  durationSeconds?: number;
  instructions?: string;
  model?: string;
  organizationId: string;
  platform?: string;
  topic: string;
  userId: string;
}
