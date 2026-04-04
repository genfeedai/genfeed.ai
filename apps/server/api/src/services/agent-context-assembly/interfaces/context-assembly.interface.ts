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
  persona?: string;
  defaultModel?: string;
  voice?: {
    tone?: string;
    style?: string;
    audience?: string;
    messagingPillars?: string[];
    doNotSoundLike?: string[];
    sampleOutput?: string;
    values?: string[];
    taglines?: string[];
    hashtags?: string[];
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
    fontFamily?: string;
    referenceImages?: Array<{
      category: string;
      label?: string;
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
