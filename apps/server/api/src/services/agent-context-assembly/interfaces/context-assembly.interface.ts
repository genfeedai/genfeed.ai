import type { IBrandKitReadiness } from '@genfeedai/interfaces';

export interface AssembleContextParams {
  organizationId: string;
  brandId?: string;
  query?: string;
  platform?: string;
  layers?: ContextLayers;
  credentialId?: string;
}

export interface ContextLayers {
  brandIdentity?: boolean;
  brandGuidance?: boolean;
  brandMemory?: boolean;
  ragContext?: boolean;
  recentPosts?: boolean;
  performancePatterns?: boolean;
}

export interface AssembledBrandContext {
  brandId: string;
  brandName: string;
  brandDescription?: string;
  promptGuidelines?: string;
  brandKitReadiness?: IBrandKitReadiness;
  persona?: string;
  defaultModel?: string;
  voice?: {
    canonicalSource?: 'brand' | 'founder' | 'hybrid';
    tone?: string;
    style?: string;
    audience?: string;
    messagingPillars?: string[];
    doNotSoundLike?: string[];
    sampleOutput?: string;
    values?: string[];
    taglines?: string[];
    hashtags?: string[];
    approvedHooks?: string[];
    bannedPhrases?: string[];
    writingRules?: string[];
    exemplarTexts?: string[];
  };
  strategy?: {
    contentTypes?: string[];
    platforms?: string[];
    goals?: string[];
    frequency?: string;
  };
  memoryInsights?: Array<{
    insight: string;
    category: string;
    confidence: number;
  }>;
  ragEntries?: Array<{
    content: string;
    source: string;
    relevance: number;
  }>;
  recentPostSummaries?: string[];
  topPatterns?: Array<{
    patternType: string;
    label: string;
    formula: string;
    avgPerformanceScore: number;
    examples: Array<{ text: string }>;
  }>;
  visualIdentity?: {
    primaryColor?: string;
    secondaryColor?: string;
    backgroundColor?: string;
    fontFamily?: string;
    logoUrl?: string;
    bannerUrl?: string;
    referenceImages?: Array<{
      category: string;
      label?: string;
      url: string;
    }>;
  };
  assembledAt: Date;
  layersUsed: string[];
  credentialHandle?: string;
  credentialPlatform?: string;
  credentialDisplayName?: string;
}

export interface SystemPromptOptions {
  maxBrandContextLength?: number;
  includeRecentPosts?: boolean;
  includeMemoryInsights?: boolean;
  includeRagContext?: boolean;
  replyStyle?: string;
}
