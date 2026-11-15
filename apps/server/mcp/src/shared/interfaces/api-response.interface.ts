/**
 * Base API response wrapper for JSON:API format
 */
export interface ApiResponse<T> {
  data?: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
  errors?: Array<{
    detail?: string;
    status?: string;
    title?: string;
  }>;
}

/**
 * JSON:API resource object
 */
interface ApiResource<TAttributes> {
  id: string;
  type: string;
  attributes?: TAttributes;
  relationships?: Record<string, unknown>;
}

/**
 * Article resource attributes from API
 */
/**
 * Mirrors `articleAttributes` in `@genfeedai/serializers`. The title is
 * serialized as `label` and the excerpt as `summary`; there is no `title`,
 * `excerpt`, or `wordCount` attribute on the wire — declaring them made three
 * read sites here type-check while always resolving to `undefined`.
 */
interface ArticleAttributes {
  category?: string;
  content?: string;
  createdAt?: string;
  id?: string;
  label?: string;
  status?: string;
  summary?: string;
  updatedAt?: string;
}

/**
 * Post resource attributes from API
 */
interface PostAttributes {
  contentId?: string;
  createdAt?: string;
  executionState?: string;
  platform?: string;
  publishedAt?: string;
  publishedUrl?: string;
  scheduledAt?: string;
  status?: string;
  targetExecutionState?: string;
  visibility?: string;
}

/**
 * Trend resource attributes from API
 */
interface TrendAttributes {
  category?: string;
  growth?: number;
  name?: string;
  relatedKeywords?: string[];
  topic?: string;
  volume?: number;
}

/**
 * Workflow template resource attributes from API
 */
interface WorkflowTemplateAttributes {
  category?: string;
  creditsRequired?: number;
  description?: string;
  estimatedDuration?: number;
  name?: string;
  nodes?: unknown[];
}

/**
 * Type aliases for common API resource types
 */
export type ArticleResource = ApiResource<ArticleAttributes>;
export type PostResource = ApiResource<PostAttributes>;
export type TrendResource = ApiResource<TrendAttributes>;
export type WorkflowTemplateResource = ApiResource<WorkflowTemplateAttributes>;
