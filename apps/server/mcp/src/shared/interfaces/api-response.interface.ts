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
export interface ApiResource<TAttributes> {
  id: string;
  type: string;
  attributes?: TAttributes;
  relationships?: Record<string, unknown>;
}

/**
 * Video resource attributes from API
 */
export interface VideoAttributes {
  createdAt?: string;
  duration?: number;
  id?: string;
  message?: string;
  progress?: number;
  status?: string;
  title?: string;
  url?: string;
  views?: number;
}

/**
 * Article resource attributes from API
 */
export interface ArticleAttributes {
  category?: string;
  content?: string;
  createdAt?: string;
  excerpt?: string;
  id?: string;
  status?: string;
  title?: string;
  updatedAt?: string;
  wordCount?: number;
}

/**
 * Image resource attributes from API
 */
export interface ImageAttributes {
  createdAt?: string;
  id?: string;
  prompt?: string;
  size?: string;
  status?: string;
  style?: string;
  url?: string;
}

/**
 * Avatar resource attributes from API
 */
export interface AvatarAttributes {
  age?: string;
  createdAt?: string;
  gender?: string;
  id?: string;
  name?: string;
  status?: string;
  style?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
}

/**
 * Music resource attributes from API
 */
export interface MusicAttributes {
  createdAt?: string;
  duration?: number;
  genre?: string;
  id?: string;
  mood?: string;
  prompt?: string;
  status?: string;
  url?: string;
}

/**
 * Post resource attributes from API
 */
export interface PostAttributes {
  contentId?: string;
  createdAt?: string;
  platform?: string;
  publishedAt?: string;
  publishedUrl?: string;
  scheduledAt?: string;
  status?: string;
}

/**
 * Trend resource attributes from API
 */
export interface TrendAttributes {
  category?: string;
  growth?: number;
  name?: string;
  relatedKeywords?: string[];
  topic?: string;
  volume?: number;
}

/**
 * Workflow resource attributes from API
 */
export interface WorkflowAttributes {
  createdAt?: string;
  currentStepIndex?: number;
  description?: string;
  id?: string;
  lastRunAt?: string;
  name?: string;
  nextRunAt?: string;
  status?: string;
  steps?: unknown[];
  updatedAt?: string;
}

/**
 * Workflow template resource attributes from API
 */
export interface WorkflowTemplateAttributes {
  category?: string;
  creditsRequired?: number;
  description?: string;
  estimatedDuration?: number;
  name?: string;
  steps?: unknown[];
}

/**
 * Workflow execution attributes from API
 */
export interface WorkflowExecutionAttributes {
  completedAt?: string;
  error?: string;
  id?: string;
  results?: unknown;
  startedAt?: string;
  status?: string;
}

/**
 * Type aliases for common API resource types
 */
export type VideoResource = ApiResource<VideoAttributes>;
export type ArticleResource = ApiResource<ArticleAttributes>;
export type ImageResource = ApiResource<ImageAttributes>;
export type AvatarResource = ApiResource<AvatarAttributes>;
export type MusicResource = ApiResource<MusicAttributes>;
export type PostResource = ApiResource<PostAttributes>;
export type TrendResource = ApiResource<TrendAttributes>;
export type WorkflowResource = ApiResource<WorkflowAttributes>;
export type WorkflowTemplateResource = ApiResource<WorkflowTemplateAttributes>;
export type WorkflowExecutionResource =
  ApiResource<WorkflowExecutionAttributes>;
