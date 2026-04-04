export interface IContentTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  industry: TemplateIndustry[];
  type: TemplateType;
  thumbnail?: string;
  tags: string[];
  variables: TemplateVariable[];
  content: TemplateContent;
  metadata: TemplateMetadata;
  performance: TemplatePerformance;
  scope?: boolean;
  isPremium: boolean;
  isActive?: boolean;
  createdBy: string;
  organizationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateCategory =
  | 'social-media'
  | 'marketing'
  | 'ecommerce'
  | 'education'
  | 'entertainment'
  | 'news'
  | 'personal-brand'
  | 'corporate'
  | 'nonprofit';

export type TemplateIndustry =
  | 'technology'
  | 'finance'
  | 'healthcare'
  | 'retail'
  | 'food'
  | 'fashion'
  | 'travel'
  | 'fitness'
  | 'real-estate'
  | 'automotive'
  | 'general';

export type TemplateType =
  | 'video'
  | 'image'
  | 'caption'
  | 'article'
  | 'campaign'
  | 'workflow';

export interface TemplateVariable {
  id: string;
  name: string;
  label: string;
  description?: string;
  type: VariableType;
  defaultValue?: string | number | boolean;
  required: boolean;
  validation?: IVariableValidation;
  options?: IVariableOptionUI[];
}

export type VariableType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'color'
  | 'image'
  | 'video'
  | 'date'
  | 'url';

export interface IVariableValidation {
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface IVariableOptionUI {
  label: string;
  value: string | number;
}

export interface TemplateContent {
  prompt?: string;
  style?: string;
  mood?: string;
  aspectRatio?: string;
  duration?: number;
  settings?: Record<string, unknown>;
  structure?: IContentStructureUI;
}

export interface IContentStructureUI {
  scenes?: ISceneTemplateUI[];
  sections?: ISectionTemplateUI[];
  elements?: IElementTemplateUI[];
}

export interface ISceneTemplateUI {
  id: string;
  order: number;
  duration: number;
  prompt: string;
  variables: string[];
}

export interface ISectionTemplateUI {
  id: string;
  order: number;
  title: string;
  content: string;
  variables: string[];
}

export interface IElementTemplateUI {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  variables: string[];
}

export interface TemplateMetadata {
  version: string;
  author?: string;
  license?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime?: number; // minutes
  requiredFeatures?: string[];
  compatiblePlatforms?: string[];
}

export interface TemplatePerformance {
  usageCount: number;
  avgEngagement?: number;
  avgReach?: number;
  rating?: number;
  reviews?: number;
  successRate?: number;
}

export interface TemplateFilter {
  category?: TemplateCategory[];
  industry?: TemplateIndustry[];
  type?: TemplateType[];
  difficulty?: string[];
  isPremium?: boolean;
  scope?: boolean;
  search?: string;
  minRating?: number;
  sortBy?: TemplateSortBy;
}

export type TemplateSortBy = 'popular' | 'recent' | 'rating' | 'usage' | 'name';

export interface TemplateUsage {
  id: string;
  templateId: string;
  userId: string;
  organizationId: string;
  variables: Record<string, unknown>;
  resultId?: string;
  performance?: {
    views?: number;
    engagement?: number;
    conversions?: number;
  };
  createdAt: Date;
}

export interface TemplateSuggestion {
  template: IContentTemplate;
  score: number;
  reasons: string[];
  matchedKeywords: string[];
}

export interface TemplateGenerationRequest {
  templateId: string;
  variables: Record<string, unknown>;
  customizations?: Record<string, unknown>;
}

export interface TemplateGenerationResult {
  id: string;
  templateId: string;
  content: unknown; // Depends on template type
  variables: Record<string, unknown>;
  generatedAt: Date;
}
