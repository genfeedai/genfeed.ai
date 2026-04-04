import {
  Platform,
  TemplateCategory,
  TemplateDifficulty,
  TemplateIndustry,
  TemplateSortBy,
  VariableType,
} from '@genfeedai/enums';
import type { IBaseEntity, IOrganization, IUser } from '../index';

export interface ITemplate extends IBaseEntity {
  organization?: string;
  organizationData?: IOrganization | string;
  createdBy?: string;
  user?: IUser | string;
  key?: string;
  purpose: 'content' | 'prompt';
  category?: TemplateCategory;
  label: string;
  description: string;
  content: string;
  variables: ITemplateVariable[];
  categories?: string[];
  industries?: string[];
  platforms?: Platform[];
  tags?: string[];
  metadata?: ITemplateMetadata | string;
  performance?: ITemplatePerformance;
  scope?: string;
  isPremium?: boolean;
  isFeatured?: boolean;
  version?: number;
  isActive?: boolean;
}

export interface ITemplateVariable {
  name: string; // e.g., "product_name", "cta"
  label: string; // e.g., "Product Name", "Call to Action"
  description: string;
  type: 'text' | 'number' | 'date' | 'select' | VariableType;
  required: boolean;
  defaultValue?: string;
  options?: string[]; // For select type
}

export interface IVariableOption {
  label: string;
  value: string | number;
}

export interface ITemplateContent {
  prompt?: string;
  style?: string;
  mood?: string;
  aspectRatio?: string;
  duration?: number;
  settings?: Record<string, unknown>;
  structure?: IContentStructure;
}

export interface IContentStructure {
  scenes?: ISceneTemplate[];
  sections?: ISectionTemplate[];
  elements?: IElementTemplate[];
}

export interface ISceneTemplate {
  id: string;
  order: number;
  duration: number;
  prompt: string;
  variables: string[];
}

export interface ISectionTemplate {
  id: string;
  order: number;
  title: string;
  content: string;
  variables: string[];
}

export interface IElementTemplate {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  variables: string[];
}

export interface ITemplateMetadata {
  version?: string | number;
  author?: string;
  license?: string;
  difficulty?: TemplateDifficulty;
  estimatedTime?: number;
  requiredFeatures?: string[];
  compatiblePlatforms?: string[];
  successRate?: number;
  averageQuality?: number;
  usageCount?: number;
  lastUsed?: Date;
}

export interface ITemplatePerformance {
  usageCount?: number;
  avgEngagement?: number;
  avgReach?: number;
  rating?: number;
  ratingCount?: number;
  successRate?: number;
  reviews?: number;
}

export interface ITemplateFilter {
  purpose?: 'content' | 'prompt';
  category?: TemplateCategory[];
  industries?: TemplateIndustry[];
  difficulty?: TemplateDifficulty[];
  isPremium?: boolean;
  scope?: string;
  search?: string;
  minRating?: number;
  sortBy?: TemplateSortBy;
}

export interface ITemplateUsage {
  id: string;
  template: string;
  user?: string;
  organization: string;
  variables: Record<string, unknown>;
  resultId?: string;
  performance?: {
    views?: number;
    engagement?: number;
    conversions?: number;
  };
  createdAt: Date;
}

export interface ITemplateSuggestion {
  template: ITemplate;
  score: number;
  reasons: string[];
  matchedKeywords?: string[];
}

export interface ITemplateGenerationRequest {
  template: string; // ObjectId reference
  variables: Record<string, unknown>;
  customizations?: Record<string, unknown>;
}

export interface ITemplateGenerationResult {
  id: string;
  template: string; // ObjectId reference
  content: unknown; // Depends on template type
  variables: Record<string, unknown>;
  generatedAt: Date;
}
