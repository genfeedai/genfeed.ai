export interface IHookPerformance {
  hookId: string;
  organizationId: string;
  brandId: string;

  // Hook details
  hookFormula: string; // e.g. 'person_conflict_resolution'
  hookText: string;
  captionHook: string;
  niche: string;
  product: string;

  // Slideshow details
  slideCount: number;
  imageModel: string;
  slidePrompts: string[];

  // Performance metrics (populated after publishing)
  postId: string | null;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number; // (likes + comments + shares + saves) / views
  completionRate: number; // % who saw all slides

  // Timestamps
  publishedAt: Date | null;
  lastAnalyticsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHookPerformanceSummary {
  hookFormula: string;
  totalPosts: number;
  avgViews: number;
  avgEngagementRate: number;
  topPerformer: {
    hookText: string;
    views: number;
    engagementRate: number;
  } | null;
}

export interface IPromptVersion {
  versionId: string;
  organizationId: string;
  brandId: string;

  // Prompt details
  nodeType: string; // 'hookGenerator' | 'captionGen' | 'imageGen'
  promptTemplate: string;
  variables: Record<string, string>;
  resolvedPrompt: string;

  // Linked performance
  hookPerformanceId: string | null;
  postId: string | null;

  // Metrics
  performanceScore: number | null; // Normalized 0-100

  // Timestamps
  createdAt: Date;
}
