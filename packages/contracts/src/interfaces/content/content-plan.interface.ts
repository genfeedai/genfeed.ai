import type {
  ContentPlanItemStatus,
  ContentPlanItemType,
  ContentPlanStatus,
} from '../..';

/**
 * A generated content plan for a brand, produced by `ContentPlannerService`.
 * `description` carries the cold-start/grounded provenance line the planner
 * writes at generation time — see `parsePlanSeedSummary` in
 * `@helpers/content/content-plan-seed.helper` to read it back.
 */
export interface IContentPlan {
  id: string;
  name: string;
  description?: string;
  status: ContentPlanStatus;
  periodStart: string;
  periodEnd: string;
  itemCount: number;
  executedCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IContentPlanItem {
  id: string;
  planId: string;
  brandId?: string;
  status: ContentPlanItemStatus;
  type: ContentPlanItemType;
  topic: string;
  prompt: string;
  platforms: string[];
  scheduledAt?: string;
  skillSlug?: string;
  pipelineSteps?: Array<{
    type: string;
    model: string;
    prompt?: string;
    aspectRatio?: string;
  }>;
  confidence?: number;
  postId?: string;
  error?: string;
}

export interface IGenerateContentPlanInput {
  name?: string;
  periodStart: string;
  periodEnd: string;
  itemCount?: number;
  topics?: string[];
  platforms?: string[];
  additionalInstructions?: string;
}
