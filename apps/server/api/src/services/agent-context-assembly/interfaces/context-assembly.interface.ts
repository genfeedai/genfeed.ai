import type {
  IBrandKitReadiness,
  KnowledgeRetrievalCitation,
} from '@genfeedai/contracts/interfaces';

export interface AssembleContextParams {
  organizationId: string;
  /**
   * The thread's own validated brand scope — pass this only when the caller
   * actually has one. When omitted, brand identity (name, voice, persona)
   * still resolves cosmetically to the organization's `isSelected` brand, but
   * every brand-owned content layer (saved memory, BRAND_TRUTH Knowledge,
   * recent posts, performance patterns, and RAG) is skipped rather than
   * silently reading whichever brand happens to be selected. RAG instead
   * falls back to organization scope plus the actor's personal scope — see
   * `userId`.
   */
  brandId?: string;
  /**
   * The acting user. Required to ground automatic Knowledge (RAG) retrieval
   * in the actor's personal scope when `brandId` is omitted; without it that
   * retrieval falls back to organization scope only. Not required when
   * `brandId` is set.
   */
  userId?: string;
  query?: string;
  platform?: string;
  layers?: ContextLayers;
  credentialId?: string;
}

export interface ContextLayers {
  brandIdentity?: boolean;
  brandGuidance?: boolean;
  brandMemory?: boolean;
  /** BRAND_TRUTH Knowledge passages (requires a query). Default on. */
  brandKnowledge?: boolean;
  ragContext?: boolean;
  recentPosts?: boolean;
  performancePatterns?: boolean;
}

/** Every layer name `assembleContext` can record in `layersUsed`. */
export type AssembledContextLayerName =
  | 'brandIdentity'
  | 'platformOverride'
  | 'brandGuidance'
  | 'brandMemory'
  | 'brandKnowledge'
  | 'ragContext'
  | 'recentPosts'
  | 'performancePatterns'
  | 'credentialContext';

/**
 * A retrieved Knowledge passage from the automatic chat-retrieval layer,
 * scoped to the thread's validated brand plus org-scope sources (or, without
 * a brand, org-scope plus the actor's personal scope). `citation` carries the
 * source id, version id, title, kind, purpose and URL — every entry here was
 * matched to a live, visible, non-deleted Knowledge source.
 */
export interface AssembledRagEntry {
  citation: KnowledgeRetrievalCitation;
  content: string;
  relevance: number;
}

/**
 * An authoritative Knowledge passage. Only BRAND_TRUTH sources owned by the
 * active brand (or shared organization-wide) reach this list; `citation`
 * carries the source id, version id, title, kind and purpose.
 */
export interface AssembledBrandKnowledgeEntry {
  citation: KnowledgeRetrievalCitation;
  /** Passage exactly as rendered into the prompt (normalized, capped). */
  content: string;
  relevance: number;
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
    topics?: string[];
  };
  memoryInsights?: Array<{
    insight: string;
    category: string;
    confidence: number;
  }>;
  ragEntries?: AssembledRagEntry[];
  brandKnowledgeEntries?: AssembledBrandKnowledgeEntry[];
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
  layersUsed: AssembledContextLayerName[];
  credentialHandle?: string;
  credentialPlatform?: string;
  credentialDisplayName?: string;
}

export interface SystemPromptOptions {
  maxBrandContextLength?: number;
  includeBrandKnowledge?: boolean;
  includeRecentPosts?: boolean;
  includeMemoryInsights?: boolean;
  includeRagContext?: boolean;
  replyStyle?: string;
}

/**
 * Budget tiers, lowest first: sections are reduced in this order when the
 * brand context exceeds its character budget.
 */
export type BrandContextBudgetPriority =
  | 'rag'
  | 'recentPosts'
  | 'historicalPerformance'
  | 'brandKnowledge'
  | 'general'
  | 'customInstructions'
  | 'guardrails'
  | 'brandVoice';

/** What the budget did to one rendered section. */
export interface BrandContextBudgetSectionReport {
  /** First line of the section, e.g. `## Brand Knowledge`. */
  header: string;
  priority: BrandContextBudgetPriority;
  originalLength: number;
  renderedLength: number;
  /** `trimmed`: shortened; `dropped`: removed entirely by the budget. */
  status: 'kept' | 'trimmed' | 'dropped';
}

export interface BrandContextBudgetResult {
  /** Brand context text after budget trimming. */
  text: string;
  /** Effective budget; `null` when unbounded. */
  maxLength: number | null;
  untrimmedLength: number;
  isTrimmed: boolean;
  /** Sections in render order, including dropped ones. */
  sections: BrandContextBudgetSectionReport[];
}

/** Final system prompt plus a record of how the brand context was fitted. */
export interface RenderedBrandSystemPrompt {
  /** Exactly what `buildSystemPrompt` returns. */
  prompt: string;
  basePrompt: string;
  brandContext: BrandContextBudgetResult;
}
