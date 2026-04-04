import type {
  KnowledgeBaseCategory,
  KnowledgeBaseScope,
  KnowledgeBaseStatus,
  Platform,
} from '@genfeedai/enums';

// --- Entity interfaces ---

export interface KnowledgeBranding {
  tone?: string;
  voice?: string;
  audience?: string;
  values?: string[];
  taglines?: string[];
  hashtags?: string[];
}

export interface KnowledgeSource {
  category: KnowledgeBaseCategory;
  label: string;
  referenceUrl: string;
  summary?: string;
  tags?: string[];
  externalId?: string;
}

export interface KnowledgeBase {
  id: string;
  label: string;
  description?: string;
  status: KnowledgeBaseStatus;
  scope: KnowledgeBaseScope;
  organizationId?: string;
  brandId?: string;
  userId?: string;
  branding?: KnowledgeBranding;
  sources?: KnowledgeSource[];
  fontFamily?: string;
  defaultVideoModel?: string;
  defaultImageModel?: string;
  defaultImageToVideoModel?: string;
  defaultMusicModel?: string;
  lastAnalyzedAt?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface KnowledgeBaseDisplay {
  id: string;
  name: string;
  description?: string;
  type?: string;
  status?: string;
  documentsCount?: number;
  size?: number;
  lastAnalyzedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// --- Content/UI interfaces ---

export interface IContentKnowledgeBase {
  id: string;
  createdAt: string;
  updatedAt: string;

  label: string;
  description: string;
  status: KnowledgeBaseStatus;
}

export interface ISocialAccount {
  id: string;
  platform:
    | Platform.INSTAGRAM
    | Platform.TWITTER
    | Platform.FACEBOOK
    | Platform.LINKEDIN
    | Platform.TIKTOK
    | Platform.YOUTUBE;
  handle: string;
  url: string;
  verified: boolean;
  followersCount?: number;
  lastScraped?: string;
}

export interface IBrandAnalysis {
  id: string;
  brandTone: string;
  brandVoice: string;
  targetAudience: string;
  keyThemes: string[];
  colorPalette: string[];
  contentStyle: string;
  uniqueSellingPoints: string[];
  competitorInsights?: string[];
  recommendations: string[];
  analyzedAt: string;
}

export interface IMasterPrompt {
  id: string;
  category: KnowledgeBaseCategory;
  title: string;
  prompt: string;
  description: string;
  tags: string[];
  examples?: string[];
  performance?: IPromptPerformance;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IPromptPerformance {
  usageCount: number;
  averageRating: number;
  successRate: number;
  lastUsed?: string;
}

export type KnowledgeScope = KnowledgeBaseScope;

export interface IKnowledgeStats {
  totalSources: number;
  readyCount: number;
  backlogCount: number;
  processingCount: number;
  totalTokens: number;
  averageCoverage: number;
}

export interface IContentKnowledgeSource {
  id: string;
  label: string;
  category: KnowledgeBaseCategory;
  url?: string;
  status: KnowledgeBaseStatus;
  lastSyncedAt?: string;
  tokens?: number;
  coverage?: number;
  instructions?: string;
  assignedBrandIds?: string[];
  createdAt?: string;
}

export interface IKnowledgeBaseCollection {
  id: string;
  label: string;
  scope: KnowledgeScope;
  ownerId: string;
  ownerLabel: string;
  description: string;
  lastUpdatedAt: string;
  promptExcerpt: string;
  totalTokens?: number;
  totalSources: number;
  sources: IContentKnowledgeSource[];
}

export interface IKnowledgeSourceFormValues {
  label: string;
  category: KnowledgeBaseCategory;
  url: string;
  instructions: string;
  scope: KnowledgeBaseScope;
  collectionId: string;
  shareWithAllBrands: boolean;
  attachToBrands: string[];
}

// --- RAG/AI interfaces ---

export interface IKnowledgeBase {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: KnowledgeBaseType;
  status: 'active' | 'indexing' | 'paused' | 'error';
  sources: IKnowledgeSource[];
  settings: IKnowledgeBaseSettings;
  stats: IKnowledgeBaseStats;
  createdAt: Date;
  updatedAt: Date;
}

export type KnowledgeBaseType =
  | 'brand-voice'
  | 'content-library'
  | 'audience-data'
  | 'product-info'
  | 'campaign-data'
  | 'custom';

export interface IKnowledgeSource {
  id: string;
  type: SourceType;
  name: string;
  url?: string;
  fileId?: string;
  brandId?: string;
  content?: string;
  metadata: Record<string, unknown>;
  status: 'indexed' | 'pending' | 'error';
  lastIndexed?: Date;
  chunkCount: number;
}

export type SourceType =
  | 'document'
  | 'website'
  | 'social-account'
  | 'analytics-data'
  | 'manual-entry'
  | 'api';

export interface IKnowledgeBaseSettings {
  autoUpdate: boolean;
  updateFrequency?: 'daily' | 'weekly' | 'monthly';
  chunkSize: number;
  chunkOverlap: number;
  embeddingModel: string;
  maxChunks?: number;
  excludePatterns?: string[];
  includeMetadata: string[];
}

export interface IKnowledgeBaseStats {
  totalChunks: number;
  totalTokens: number;
  lastIndexed: Date;
  queriesCount: number;
  avgRelevanceScore: number;
}

export interface IRAGQuery {
  query: string;
  knowledgeBaseIds?: string[];
  filters?: Record<string, unknown>;
  maxResults?: number;
  minRelevanceScore?: number;
  includeMetadata?: boolean;
}

export interface IRAGResult {
  chunks: IRetrievedChunk[];
  totalResults: number;
  avgRelevanceScore: number;
  queryTime: number;
}

export interface IRetrievedChunk {
  id: string;
  content: string;
  relevanceScore: number;
  source: {
    name: string;
    type: SourceType;
    url?: string;
  };
  metadata: Record<string, unknown>;
  highlight?: string;
}

export interface IEnhancedPrompt {
  originalPrompt: string;
  enhancedPrompt: string;
  context: string[];
  relevantKnowledge: IRetrievedChunk[];
  improvements: string[];
  estimatedQualityBoost: number;
}

export interface IRAGEnhanceRequest {
  prompt: string;
  contentType: 'video' | 'image' | 'caption' | 'article' | 'voice';
  knowledgeBaseIds?: string[];
  brand?: {
    id: string;
    platform: string;
  };
  useContext?: {
    brandVoice?: boolean;
    pastContent?: boolean;
    audienceData?: boolean;
    productInfo?: boolean;
  };
}
