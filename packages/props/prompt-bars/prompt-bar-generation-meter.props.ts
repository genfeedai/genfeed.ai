import type { IModel } from '@genfeedai/contracts/interfaces';

export interface StudioGenerationCostModels {
  isEstimate: boolean;
  models: IModel[];
}

export interface ResolveStudioGenerationCostModelsInput {
  catalog: IModel[];
  defaultModelKey?: string;
  selectedModels: IModel[];
}

export interface ResolveStudioGenerationMeterInput {
  credits: number;
  isEstimate: boolean;
  queuedCount: number;
}

export interface StudioGenerationMeter {
  ariaLabel: string;
  credits: number;
  isEstimate: boolean;
  label: string;
  queuedCount: number;
}

export interface PromptBarGenerationMeterProps {
  meter: StudioGenerationMeter;
}
