import type { IngredientStatus } from '../..';

export type GenerationEtaConfidence = 'low' | 'medium' | 'high';

export interface IGenerationItem {
  id: string;
  type: 'image' | 'video' | 'music' | 'avatar' | 'voice';
  prompt: string;
  model: string;
  startTime: Date;
  status: IngredientStatus[];
  error?: string;
  resultId?: string;
  estimatedDurationMs?: number;
  remainingDurationMs?: number;
  etaConfidence?: GenerationEtaConfidence;
  currentPhase?: string;
  lastEtaUpdateAt?: string;
}

export interface IGenerationState {
  items: IGenerationItem[];
  activeCount: number;
  maxConcurrent: number;
}
