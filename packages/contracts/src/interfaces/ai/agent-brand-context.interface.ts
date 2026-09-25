import type {
  IBrandConversationStarter,
  IBrandPromptSeed,
} from '../organization/brand-profile.interface';

/**
 * Where a user edits the data behind a context layer. The app maps each key
 * to a brand settings route; the agent names it in prose.
 */
export type AgentBrandContextEditTarget =
  | 'interview'
  | 'kit'
  | 'knowledge'
  | 'memory'
  | 'profile'
  | 'skills'
  | 'voice';

export type AgentBrandContextLayerKey =
  | 'guidelines'
  | 'identity'
  | 'knowledge'
  | 'memories'
  | 'patterns'
  | 'performanceInsights'
  | 'persona'
  | 'prompting'
  | 'recentPosts'
  | 'skills'
  | 'strategy'
  | 'visualIdentity'
  | 'voice';

/** Whether a layer holds data and whether that data reaches the prompt. */
export interface IAgentBrandContextLayerStatus {
  editTarget: AgentBrandContextEditTarget;
  isEmpty: boolean;
  /** True when this layer's data is rendered into the chat system prompt. */
  isInjected: boolean;
  key: AgentBrandContextLayerKey;
}

export interface IAgentBrandContextVoice {
  approvedHooks: string[];
  audience?: string;
  bannedPhrases: string[];
  canonicalSource?: 'brand' | 'founder' | 'hybrid';
  doNotSoundLike: string[];
  exemplarTexts: string[];
  hashtags: string[];
  messagingPillars: string[];
  sampleOutput?: string;
  style?: string;
  taglines: string[];
  tone?: string;
  values: string[];
  writingRules: string[];
}

export interface IAgentBrandContextStrategy {
  contentTypes: string[];
  frequency?: string;
  goals: string[];
  platforms: string[];
  topics: string[];
}

export interface IAgentBrandContextVisualIdentity {
  backgroundColor?: string;
  bannerUrl?: string;
  fontFamily?: string;
  logoUrl?: string;
  primaryColor?: string;
  referenceImageCount: number;
  secondaryColor?: string;
}

export interface IAgentBrandContextInsight {
  category: string;
  confidence: number;
  insight: string;
}

export interface IAgentBrandContextPattern {
  avgPerformanceScore: number;
  formula: string;
  label: string;
  patternType: string;
}

export type AgentBrandContextKnowledgeOrigin =
  /** Authoritative BRAND_TRUTH Knowledge source passage. */
  | 'brand_knowledge'
  /** Saved-memory passage (brand voice / content library context base). */
  | 'context_memory';

export interface IAgentBrandContextKnowledgeEntry {
  content: string;
  origin: AgentBrandContextKnowledgeOrigin;
  relevance: number;
  /** Knowledge source title or context base label. */
  source: string;
  /** Knowledge source id or context base id the passage came from. */
  sourceId?: string;
}

export interface IAgentBrandContextLayers {
  guidelines?: string;
  identity: {
    description?: string;
    name: string;
  };
  knowledge: IAgentBrandContextKnowledgeEntry[];
  patterns: IAgentBrandContextPattern[];
  performanceInsights: IAgentBrandContextInsight[];
  persona?: string;
  prompting: {
    conversationStarters: IBrandConversationStarter[];
    seeds: IBrandPromptSeed[];
  };
  recentPosts: string[];
  strategy?: IAgentBrandContextStrategy;
  visualIdentity?: IAgentBrandContextVisualIdentity;
  voice?: IAgentBrandContextVoice;
}

export interface IAgentBrandContextMemory {
  brandId?: string | null;
  content?: string | null;
  contentType?: string | null;
  createdAt?: string;
  id: string;
  /** Personal memories the requester authored can be archived by them. */
  isOwnedByRequester: boolean;
  kind?: string | null;
  platform?: string | null;
  /** Retrieval score from the feedback-memory ranker. */
  score?: number;
  scope?: string | null;
  summary?: string | null;
}

export interface IAgentBrandContextSkill {
  isBuiltIn: boolean;
  name: string;
  slug: string;
  source?: string;
}

export interface IAgentBrandContextTrimmedSection {
  header: string;
  /** True when the budget removed the section entirely. */
  isDropped: boolean;
  keptChars: number;
  originalChars: number;
}

export interface IAgentBrandContextBudget {
  /** Character cap applied to the assembled brand-context block. */
  capChars: number;
  isTrimmed: boolean;
  trimmedSections: IAgentBrandContextTrimmedSection[];
  /** Brand-context characters before the budget was applied. */
  untrimmedChars: number;
  /** Brand-context characters that reach the prompt. */
  usedChars: number;
}

export interface IAgentBrandContextModel {
  creditsPerRound: number;
  key: string;
  label?: string;
}

/**
 * Everything the chat agent is given about a brand for a neutral turn — the
 * same assembly the chat turn runs, rendered for inspection.
 */
export interface IAgentBrandContextSnapshot {
  brandId: string;
  brandName: string;
  budget: IAgentBrandContextBudget;
  generatedAt: string;
  /** `brandId` — the snapshot is a per-brand singleton resource. */
  id: string;
  layerStatus: IAgentBrandContextLayerStatus[];
  layers: IAgentBrandContextLayers;
  /** Raw layer names reported by the context assembler. */
  layersUsed: string[];
  memories: IAgentBrandContextMemory[];
  /** Saved-memory block injected as its own system message. */
  memoryPrompt: string;
  model: IAgentBrandContextModel;
  /** Preview query the snapshot was assembled for (empty = neutral turn). */
  query: string;
  skills: IAgentBrandContextSkill[];
  /** Final system prompt text for the turn, date placeholder resolved. */
  systemPrompt: string;
}

/** One AgentMemory row as the memory list endpoints return it. */
export interface IAgentMemoryEntry {
  brandId?: string | null;
  confidence?: number | null;
  content?: string | null;
  contentType?: string | null;
  createdAt?: string;
  id: string;
  importance?: number | null;
  kind?: string | null;
  platform?: string | null;
  promotedSkillId?: string | null;
  scope?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  tags?: string[];
  updatedAt?: string;
  userId?: string;
}

/** One distilled BrandMemory insight row. */
export interface IBrandMemoryInsight {
  category: string;
  confidence: number;
  createdAt?: string;
  id: string;
  insight: string;
  source?: string;
}
