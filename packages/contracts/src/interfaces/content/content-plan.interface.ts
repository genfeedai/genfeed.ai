import type {
  ContentPlanItemStatus,
  ContentPlanItemType,
  ContentPlanStatus,
} from '../..';
import type { KnowledgeReceipt } from '../knowledge-base/knowledge-retrieval.interface';
import type {
  IContentPlanSeedSelection,
  IContentPlanSeeds,
} from './content-plan-seed.interface';

/**
 * Where a plan came from and what shaped it. The Expert Path first content
 * system records the harness profile and the authoritative corpus passages
 * that reached the planner.
 */
export interface IContentPlanProvenance {
  /** Generating surface, e.g. `expert-first-system`. */
  source: string;
  harnessProfileId?: string;
  brandOsRevisionId?: string;
  knowledgeReceipts: KnowledgeReceipt[];
  /** Authoritative corpus sources that were ready when the plan was built. */
  corpusSourceIds: string[];
  /** Platforms planned from the interview that still need a connection. */
  connectToSchedulePlatforms: string[];
}

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
  /** Effective seeds this plan was generated from (#4511 Lane F). */
  seeds?: IContentPlanSeeds;
  provenance?: IContentPlanProvenance;
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
  /** Caller-chosen subset of cold-start seeds to ground the plan in. */
  seeds?: IContentPlanSeedSelection;
}
