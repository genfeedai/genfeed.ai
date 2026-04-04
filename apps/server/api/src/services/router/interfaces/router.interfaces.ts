import { ModelCategory } from '@genfeedai/enums';

export interface PromptAnalysis {
  complexity: 'simple' | 'medium' | 'complex';
  keywords: string[];
  hasSpecificStyle: boolean;
  hasQualityIndicators: boolean;
  hasSpeedIndicators: boolean;
  estimatedLength: number;
  detectedFeatures: string[];
}

export interface ModelSelectionOptions {
  category: ModelCategory;
  prompt: string;
  prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';
  dimensions?: {
    width?: number;
    height?: number;
  };
  duration?: number;
  speech?: string;
  outputs?: number;
}

export interface ModelRecommendation {
  selectedModel: string;
  reason: string;
  modelDetails: {
    id: string;
    key: string;
    provider: string;
    category: ModelCategory;
    cost?: number;
  };
  alternatives: Array<{
    model: string;
    reason: string;
    score: number;
  }>;
  analysis: PromptAnalysis;
}

export interface ModelCapabilities {
  key: string;
  provider: string;
  category: ModelCategory;
  capabilities: string[];
  costTier: 'low' | 'medium' | 'high';
  recommendedFor: string[];
  minDimensions?: { width: number; height: number };
  maxDimensions?: { width: number; height: number };
  supportsFeatures?: string[];
  speedTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'basic' | 'standard' | 'high' | 'ultra';
}
