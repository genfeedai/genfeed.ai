import type { IngredientOrigin } from '@genfeedai/contracts';

export interface MusicCreationParams {
  prompt: string;
  genre?:
    | 'ambient'
    | 'electronic'
    | 'rock'
    | 'classical'
    | 'jazz'
    | 'pop'
    | 'cinematic';
  mood?:
    | 'upbeat'
    | 'calm'
    | 'energetic'
    | 'dramatic'
    | 'happy'
    | 'sad'
    | 'inspirational';
  duration?: number;
}

export interface MusicResponse {
  id: string;
  url?: string;
  prompt: string;
  genre?: string;
  mood?: string;
  duration: number;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  /** Permanent origin: UPLOADED, GENERATED, IMPORTED or UNKNOWN. */
  origin?: string;
}

export interface MusicListParams {
  limit?: number;
  offset?: number;
  /** Only assets with this origin. */
  origin?: IngredientOrigin;
}
