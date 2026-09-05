/**
 * Legacy Context JSON representation. Canonical first-class Knowledge records
 * are defined in knowledge-record.interface.ts. Migration is owned by #4123;
 * existing Context consumers continue using these shapes until that cutover.
 */
import type {
  KnowledgeBaseCategory,
  KnowledgeBaseScope,
  KnowledgeBaseStatus,
} from '../..';

/**
 * KnowledgeBase is ContextBase + source records. There is no separate
 * Prisma KnowledgeBase model and no second vector product — chunks are
 * ContextEntry rows under a per-brand ContextBase.
 */
export interface KnowledgeSource {
  category: KnowledgeBaseCategory;
  chunkCount?: number;
  error?: string;
  id: string;
  isDeleted?: boolean;
  label: string;
  lastIngestedAt?: string;
  referenceUrl?: string;
  status: KnowledgeBaseStatus;
  summary?: string;
  tags?: string[];
}

export interface KnowledgeBranding {
  audience?: string;
  hashtags?: string[];
  taglines?: string[];
  tone?: string;
  values?: string[];
  voice?: string;
}

export interface KnowledgeBase {
  brandId?: string;
  branding?: KnowledgeBranding;
  createdAt: string;
  defaultImageModel?: string;
  defaultImageToVideoModel?: string;
  defaultMusicModel?: string;
  defaultVideoModel?: string;
  description?: string;
  fontFamily?: string;
  id: string;
  isActive: boolean;
  label: string;
  lastAnalyzedAt?: string;
  organizationId?: string;
  scope?: KnowledgeBaseScope;
  sources?: KnowledgeSource[];
  status?: KnowledgeBaseStatus;
  updatedAt: string;
  userId?: string;
}

export interface IMasterPrompt {
  category: KnowledgeBaseCategory;
  createdAt: string;
  description: string;
  examples?: string[];
  id: string;
  isActive: boolean;
  performance?: IPromptPerformance;
  prompt: string;
  tags: string[];
  title: string;
  updatedAt: string;
}

export interface IPromptPerformance {
  averageRating: number;
  lastUsed?: string;
  successRate: number;
  usageCount: number;
}

export interface IRetrievedChunk {
  content: string;
  id?: string;
  metadata?: Record<string, unknown>;
  relevanceScore: number;
  source?: {
    name: string;
    type?: string;
    url?: string;
  };
}

export interface IRAGQuery {
  contextBaseId?: string;
  contextBaseIds?: string[];
  maxResults?: number;
  minRelevanceScore?: number;
  query: string;
}

export interface IRAGResult {
  avgRelevanceScore: number;
  chunks: IRetrievedChunk[];
  queryTime: number;
  totalResults: number;
}

export interface IEnhancedPrompt {
  context: string[];
  enhancedPrompt: string;
  estimatedQualityBoost: number;
  improvements: string[];
  originalPrompt: string;
  relevantKnowledge: IRetrievedChunk[];
}

export interface IRAGEnhanceRequest {
  brand?: {
    id: string;
    platform: string;
  };
  contentType: 'video' | 'image' | 'caption' | 'article' | 'voice';
  contextBaseIds?: string[];
  prompt: string;
  useContext?: {
    audienceData?: boolean;
    brandVoice?: boolean;
    pastContent?: boolean;
    productInfo?: boolean;
  };
}
