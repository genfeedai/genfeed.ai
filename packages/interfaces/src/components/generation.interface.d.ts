import type { IngredientStatus } from '@genfeedai/enums';
export type GenerationEtaConfidence = 'low' | 'medium' | 'high';
export interface IGenerationItem {
    id: string;
    type: 'image' | 'video' | 'music' | 'avatar';
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
//# sourceMappingURL=generation.interface.d.ts.map