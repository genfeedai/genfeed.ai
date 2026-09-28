import type {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
} from '../../enums/batch.enum';
import type { FastlaneFormat, FastlaneIdea } from './fastlane.interface';

/**
 * Studio Batch project (#5463) — one persisted surface for idea batches
 * (brand ideas → generate → review → schedule) and workflow batches (a saved
 * workflow applied to many image/video inputs). Every step, input and
 * per-item state lives on the server so a reload restores the run.
 */

/** Idea-generation choices of an idea batch. */
export interface IBatchProjectIdeaSettings {
  formats: FastlaneFormat[];
  /** Ideas per format. */
  count: number;
  angle?: string;
}

/** One scheduling destination of a batch's approved items. */
export interface IBatchProjectScheduleTarget {
  /** Credential id of the connected social account. */
  credentialId: string;
  /** Canonical lowercase platform value (tiktok, instagram, youtube). */
  platform: string;
  /** Whether the creator kept this destination selected. */
  isSelected: boolean;
  /** When to publish; omitted means publish now. */
  scheduledDate?: string;
}

/** Schedule-step choices, persisted as the creator makes them. */
export interface IBatchProjectScheduleSettings {
  targets: IBatchProjectScheduleTarget[];
  postingSetId?: string;
  timezone?: string;
}

export interface IBatchProjectSettings {
  ideas?: IBatchProjectIdeaSettings;
  schedule?: IBatchProjectScheduleSettings;
}

/** Item counts by state, shown on the project list. */
export interface IBatchProjectItemCounts {
  total: number;
  pending: number;
  generating: number;
  ready: number;
  failed: number;
  approved: number;
  rejected: number;
  scheduled: number;
}

/** One destination an item has scheduled to. */
export interface IBatchProjectScheduledTarget {
  credentialId: string;
  postId: string;
  scheduledAt: string;
}

export interface IBatchProjectItem {
  id: string;
  projectId: string;
  position: number;
  status: BatchProjectItemStatus;
  /** Idea brief (idea batches). */
  idea?: FastlaneIdea | null;
  /** Input ingredient (workflow batches). */
  inputIngredientId?: string | null;
  inputCategory?: string | null;
  /** Parent workflow batch execution and this item's index in it. */
  workflowExecutionId?: string | null;
  workflowItemIndex?: number | null;
  outputIngredientId?: string | null;
  outputCategory?: string | null;
  caption?: string | null;
  error?: string | null;
  dispatchedAt?: string | null;
  /** Draft post created when the output entered the review inbox. */
  postId?: string | null;
  reviewBatchId?: string | null;
  reviewItemId?: string | null;
  scheduledAt?: string | null;
  scheduledTargets: IBatchProjectScheduledTarget[];
  retryCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IBatchProject {
  id: string;
  organizationId?: string;
  brandId: string;
  userId?: string;
  kind: BatchProjectKind;
  name: string;
  status: BatchProjectStatus;
  step: BatchProjectStep;
  workflowId?: string | null;
  settings: IBatchProjectSettings;
  reviewBatchId?: string | null;
  itemCounts: IBatchProjectItemCounts;
  /** Present on single-project reads; omitted on list reads. */
  items?: IBatchProjectItem[];
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Tenant context every batch project operation runs in. */
export interface IBatchProjectScope {
  organizationId: string;
  userId: string;
  brandId?: string;
}

export interface ICreateBatchProjectInput {
  kind: BatchProjectKind;
  brandId: string;
  name?: string;
  workflowId?: string;
}

export interface IUpdateBatchProjectInput {
  name?: string;
  step?: BatchProjectStep;
  workflowId?: string;
  settings?: IBatchProjectSettings;
}

/** Replace an idea batch's ideas, or append workflow inputs. */
export interface IAddBatchProjectItemsInput {
  ideas?: FastlaneIdea[];
  inputs?: Array<{ ingredientId: string }>;
}

/** Browser-side dispatch outcome of one idea item. */
export interface IDispatchBatchProjectItemInput {
  ingredientId?: string;
  error?: string;
}

export type BatchProjectReviewDecision = 'approved' | 'rejected';

export interface IReviewBatchProjectItemsInput {
  itemIds: string[];
  decision: BatchProjectReviewDecision;
}

export interface IScheduleBatchProjectInput {
  targets: Array<{
    credentialId: string;
    platform: string;
    scheduledDate?: string;
  }>;
  /** Caption per item id; falls back to the item caption. */
  captions?: Record<string, string>;
  timezone?: string;
}

export interface IScheduleBatchProjectResult {
  scheduledCount: number;
  failedCount: number;
}
