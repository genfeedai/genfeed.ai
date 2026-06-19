import type {
  FastlaneAssetItem,
  FastlaneAssetStatus,
  FastlaneFormat,
  FastlaneIdea,
  FastlaneScheduleTarget,
} from '@genfeedai/interfaces';

// ────────────────────────────────────────────────────────────
// Hook param / return interfaces
// ────────────────────────────────────────────────────────────

export interface UseFastlaneIdeasParams {
  brandId: string;
  isReady: boolean;
}

export interface UseFastlaneIdeasReturn {
  ideas: FastlaneIdea[];
  isLoading: boolean;
  error: string | null;
  generateIdeas: (
    formats: FastlaneFormat[],
    count: number,
    angle?: string,
  ) => Promise<void>;
  reset: () => void;
}

export interface UseFastlaneGenerationParams {
  brandId: string;
  avatarIngredientId?: string | null;
  voiceId?: string | null;
  references?: string[];
}

export interface FastlaneAssetUpdate {
  status: FastlaneAssetStatus;
  ingredientId?: string | null;
  ingredientUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface UseFastlaneGenerationReturn {
  assets: FastlaneAssetItem[];
  isGenerating: boolean;
  startGeneration: (ideas: FastlaneIdea[]) => Promise<void>;
  failedCount: number;
  readyCount: number;
}

export interface UseFastlaneScheduleParams {
  brandId: string;
}

export interface ScheduleApprovedParams {
  assets: FastlaneAssetItem[];
  targets: FastlaneScheduleTarget[];
  captions: Record<string, string>;
  timezone: string;
}

export interface UseFastlaneScheduleReturn {
  isScheduling: boolean;
  scheduleApproved: (params: ScheduleApprovedParams) => Promise<void>;
}

// ────────────────────────────────────────────────────────────
// Wizard state
// ────────────────────────────────────────────────────────────

export type FastlaneStep = 'ideas' | 'review' | 'schedule';

// Re-export domain types for internal component use
export type {
  FastlaneAssetItem,
  FastlaneAssetStatus,
  FastlaneFormat,
  FastlaneIdea,
  FastlaneScheduleTarget,
};
