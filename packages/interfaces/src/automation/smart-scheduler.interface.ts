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
