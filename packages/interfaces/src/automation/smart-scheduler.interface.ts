export interface ISmartSchedule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  contentId: string;
  brandIds: string[];
  scheduledTime: Date;
  timezone: string;
  isAIOptimized: boolean;
  aiRecommendation?: IAIScheduleRecommendation;

  status: ScheduleStatus;
  publishedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ScheduleStatus =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled';

export interface IAIScheduleRecommendation {
  recommendedTime: Date;
  confidence: number;
  reasoning: string[];
  expectedPerformance: {
    estimatedViews: number;
    estimatedEngagement: number;
    viralPotential: number;
  };
  alternatives: Array<{
    time: Date;
    score: number;
    reason: string;
  }>;
  factors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
}

export interface IScheduleOptimizationRequest {
  contentId: string;
  contentType: 'video' | 'image' | 'article' | 'post';
  platform: string;
  targetAudience?: string;
  goal?: 'reach' | 'engagement' | 'conversions';
  constraints?: {
    earliestTime?: Date;
    latestTime?: Date;
    excludeDays?: string[];
    excludeHours?: number[];
  };
}

export interface IContentRepurposing {
  id: string;
  organizationId: string;
  sourceContentId: string;
  sourceType: 'video' | 'image' | 'article';
  targetFormats: RepurposeFormat[];
  settings: IRepurposeSettings;
  results: IRepurposeResult[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export type RepurposeFormat =
  | 'short-video'
  | 'story'
  | 'carousel'
  | 'blog-post'
  | 'social-post'
  | 'quote-card'
  | 'thumbnail'
  | 'gif'
  | 'audiogram'
  | 'infographic';

export interface IRepurposeSettings {
  preserveBranding: boolean;
  toneProfileId?: string;
  customizations?: Record<string, unknown>;
  platforms?: string[];
  qualityLevel: 'fast' | 'balanced' | 'high';
}

export interface IRepurposeResult {
  id: string;
  format: RepurposeFormat;
  contentId: string;
  url: string;
  thumbnail?: string;
  metadata: {
    duration?: number;
    dimensions?: { width: number; height: number };
    size: number;
  };
  qualityScore?: number;
  createdAt: Date;
}

export interface IMultiPlatformWorkflow {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  trigger: IWorkflowTrigger;
  steps: IWorkflowStep[];
  platforms: IAutomationPlatformConfig[];
  scheduling: IWorkflowScheduling;
  status: 'active' | 'paused' | 'archived';
  stats: IWorkflowStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowTrigger {
  type: WorkflowTriggerType;
  config: Record<string, unknown>;
}

export type WorkflowTriggerType =
  | 'manual'
  | 'schedule'
  | 'content-ready'
  | 'webhook'
  | 'event';

export interface IWorkflowStep {
  id: string;
  order: number;
  name: string;
  type: WorkflowStepType;
  config: Record<string, unknown>;
  conditions?: IStepCondition[];
  retryPolicy?: {
    maxAttempts: number;
    backoff: 'linear' | 'exponential';
  };
}

export type WorkflowStepType =
  | 'generate'
  | 'optimize'
  | 'repurpose'
  | 'schedule'
  | 'publish'
  | 'notify'
  | 'wait'
  | 'conditional';

export interface IStepCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater' | 'less';
  value: unknown;
}

export interface IAutomationPlatformConfig {
  platform: string;
  brandId: string;
  enabled: boolean;
  customizations?: {
    caption?: string;
    hashtags?: string[];
    aspectRatio?: string;
    thumbnail?: string;
  };
  scheduleOffset?: number;
}

export interface IWorkflowScheduling {
  type: 'immediate' | 'scheduled' | 'ai-optimized' | 'recurring';
  startDate?: Date;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    dayOfWeek?: number[];
    time?: string;
  };
  aiOptimization?: {
    enabled: boolean;
    goal: 'reach' | 'engagement' | 'conversions';
    learnFromResults: boolean;
  };
}

export interface IWorkflowStats {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgDuration: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
  performance: {
    avgEngagement?: number;
    avgReach?: number;
    totalConversions?: number;
  };
}

export interface IWorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  results: Record<string, unknown>;
  errors?: string[];
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
}

export type AutoPostingTriggerType =
  | 'new-content'
  | 'time-based'
  | 'performance-based';

export interface IAutoPostingTrigger {
  type: AutoPostingTriggerType;
  filters?: {
    contentTypes?: string[];
    tags?: string[];
    minQualityScore?: number;
  };
}

export interface IAutoPostingActions {
  platforms: string[];
  brandIds: string[];
  useAIScheduling: boolean;
  applyOptimization: boolean;
  repurposeFormats?: RepurposeFormat[];
}

export interface IAutoPostingLimits {
  maxPerDay?: number;
  maxPerWeek?: number;
  minTimeBetween?: number;
}

export interface IAutoPostingStats {
  totalPosts: number;
  successRate: number;
  avgEngagement: number;
}

export interface IAutoPostingRule {
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  trigger: IAutoPostingTrigger;
  actions: IAutoPostingActions;
  limits?: IAutoPostingLimits;
  stats: IAutoPostingStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBulkScheduleRequest {
  contentIds: string[];
  platforms: string[];
  brandIds: string[];
  schedulingStrategy: SchedulingStrategy;
  customSchedule?: Date[];
  options?: {
    useAIOptimization?: boolean;
    applyOptimization?: boolean;
    repurposeFormats?: RepurposeFormat[];
    staggerMinutes?: number;
  };
}

export type SchedulingStrategy =
  | 'immediate'
  | 'ai-optimal'
  | 'evenly-distributed'
  | 'custom-times';

export interface IBulkScheduleResult {
  scheduled: number;
  failed: number;
  schedules: ISmartSchedule[];
  errors?: Array<{
    contentId: string;
    error: string;
  }>;
}
