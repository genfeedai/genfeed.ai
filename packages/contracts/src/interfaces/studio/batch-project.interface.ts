import type {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
} from '../../enums/batch.enum';
import type { BatchIdea, BatchIdeaFormat } from './batch-idea.interface';

/**
 * Studio Batch project (#5463) — one persisted surface for idea batches
 * (brand ideas → generate → review → schedule) and workflow batches (a saved
 * workflow applied to many image/video inputs). Every step, input and
 * per-item state lives on the server so a reload restores the run.
 */

/** Idea-generation choices of an idea batch. */
export interface IBatchProjectIdeaSettings {
  formats: BatchIdeaFormat[];
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

/**
 * One destination an item is bound to: the post that destination uses and
 * the outcome of its last scheduling attempt. A post is bound before it is
 * scheduled so no other destination can take it over.
 */
export interface IBatchProjectScheduledTarget {
  credentialId: string;
  postId: string;
  status: 'pending' | 'scheduled' | 'failed';
  scheduledAt?: string;
}

/** How one quote line is paid: platform credits or the org's own key. */
export type BatchProjectBillingMode = 'platform' | 'byok';

/** One priced idea generation in a quote. */
export interface IBatchProjectQuoteLine {
  itemId: string;
  /** `batch-project-item:<id>:dispatch:<attempt>`; the reservation key. */
  key: string;
  attempt: number;
  format: BatchIdeaFormat;
  model: string;
  /** Platform credits; 0 when billed to the org's own key. */
  credits: number;
  billingMode: BatchProjectBillingMode;
}

/**
 * Credit quote for generating idea items. Starting (or retrying) requires
 * accepting a current quote bound to the project revision it priced.
 */
export interface IBatchProjectQuote {
  id: string;
  revision: number;
  items: IBatchProjectQuoteLine[];
  total: number;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}

/** Server-side generation of one idea item and its credit settlement. */
export interface IBatchProjectItemDispatch {
  key: string;
  attempt: number;
  model: string;
  credits: number;
  billingMode: BatchProjectBillingMode;
  reservationId?: string;
  /**
   * `queued` until credits are reserved right before the provider call;
   * `settled` once a usable output lands; `released` when it fails.
   */
  state: 'queued' | 'reserved' | 'settled' | 'released';
}

export interface IBatchProjectItem {
  id: string;
  projectId: string;
  position: number;
  status: BatchProjectItemStatus;
  /** Idea brief (idea batches). */
  idea?: BatchIdea | null;
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
  dispatch?: IBatchProjectItemDispatch | null;
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
  revision: number;
  quote?: IBatchProjectQuote | null;
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
  /** Trusted from auth, like FeatureFlagGuard: superadmins may use switched-off features. */
  isSuperAdmin?: boolean;
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
  ideas?: BatchIdea[];
  inputs?: Array<{ ingredientId: string }>;
}

/** Price idea items: every pending item, or the failed ones given. */
export interface IQuoteBatchProjectInput {
  itemIds?: string[];
}

/** Idea batches start and retry against an accepted quote. */
export interface IAcceptBatchProjectQuoteInput {
  quoteId?: string;
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
