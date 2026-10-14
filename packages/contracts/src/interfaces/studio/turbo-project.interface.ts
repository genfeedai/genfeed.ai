import type {
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  TurboProjectStep,
} from '../../enums/turbo.enum';
import type { TurboIdea, TurboIdeaFormat } from './turbo-idea.interface';

/**
 * Studio Turbo project (#5463) — one persisted surface for idea projects
 * (brand ideas → generate → review → schedule) and workflow projects (a saved
 * workflow applied to many image/video inputs). Every step, input and
 * per-item state lives on the server so a reload restores the run.
 */

/** Idea-generation choices of an idea project. */
export interface ITurboProjectIdeaSettings {
  formats: TurboIdeaFormat[];
  /** Ideas per format. */
  count: number;
  angle?: string;
}

/** One scheduling destination of a project's approved items. */
export interface ITurboProjectScheduleTarget {
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
export interface ITurboProjectScheduleSettings {
  targets: ITurboProjectScheduleTarget[];
  postingSetId?: string;
  timezone?: string;
}

export interface ITurboProjectSettings {
  ideas?: ITurboProjectIdeaSettings;
  schedule?: ITurboProjectScheduleSettings;
}

/** Item counts by state, shown on the project list. */
export interface ITurboProjectItemCounts {
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
export interface ITurboProjectScheduledTarget {
  credentialId: string;
  postId: string;
  status: 'pending' | 'scheduled' | 'failed';
  scheduledAt?: string;
}

/** How one quote line is paid: platform credits or the org's own key. */
export type TurboProjectBillingMode = 'platform' | 'byok';

/** One priced idea generation in a quote. */
export interface ITurboProjectQuoteLine {
  itemId: string;
  /** `turbo-project-item:<id>:dispatch:<attempt>`; the reservation key. */
  key: string;
  attempt: number;
  format: TurboIdeaFormat;
  model: string;
  /** Platform credits; 0 when billed to the org's own key. */
  credits: number;
  billingMode: TurboProjectBillingMode;
}

/**
 * Credit quote for generating idea items. Starting (or retrying) requires
 * accepting a current quote bound to the project revision it priced.
 */
export interface ITurboProjectQuote {
  id: string;
  revision: number;
  items: ITurboProjectQuoteLine[];
  total: number;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}

/** Server-side generation of one idea item and its credit settlement. */
export interface ITurboProjectItemDispatch {
  key: string;
  attempt: number;
  model: string;
  credits: number;
  billingMode: TurboProjectBillingMode;
  reservationId?: string;
  /**
   * What the line was charged at settlement, including any clip overrun. A
   * per-second avatar settles to the clip length HeyGen returned, so this can
   * differ from the accepted `credits`.
   */
  settledCredits?: number;
  /**
   * `queued` until credits are reserved right before the provider call;
   * `settled` once a usable output lands; `released` when it fails.
   */
  state: 'queued' | 'reserved' | 'settled' | 'released';
}

export interface ITurboProjectItem {
  id: string;
  projectId: string;
  position: number;
  status: TurboProjectItemStatus;
  /** Idea brief (idea projects). */
  idea?: TurboIdea | null;
  /** Input ingredient (workflow projects). */
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
  reviewTurboRunId?: string | null;
  reviewItemId?: string | null;
  scheduledAt?: string | null;
  scheduledTargets: ITurboProjectScheduledTarget[];
  retryCount: number;
  dispatch?: ITurboProjectItemDispatch | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ITurboProject {
  id: string;
  organizationId?: string;
  brandId: string;
  userId?: string;
  kind: TurboProjectKind;
  name: string;
  status: TurboProjectStatus;
  step: TurboProjectStep;
  workflowId?: string | null;
  settings: ITurboProjectSettings;
  reviewTurboRunId?: string | null;
  revision: number;
  quote?: ITurboProjectQuote | null;
  itemCounts: ITurboProjectItemCounts;
  /** Present on single-project reads; omitted on list reads. */
  items?: ITurboProjectItem[];
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Tenant context every Turbo project operation runs in. */
export interface ITurboProjectScope {
  organizationId: string;
  userId: string;
  brandId?: string;
  /** Trusted from auth, like FeatureFlagGuard: superadmins may use switched-off features. */
  isSuperAdmin?: boolean;
}

export interface ICreateTurboProjectInput {
  kind: TurboProjectKind;
  brandId: string;
  name?: string;
  workflowId?: string;
}

export interface IUpdateTurboProjectInput {
  name?: string;
  step?: TurboProjectStep;
  workflowId?: string;
  settings?: ITurboProjectSettings;
}

/** Replace an idea project's ideas, or append workflow inputs. */
export interface IAddTurboProjectItemsInput {
  ideas?: TurboIdea[];
  inputs?: Array<{ ingredientId: string }>;
}

/** Price idea items: every pending item, or the failed ones given. */
export interface IQuoteTurboProjectInput {
  itemIds?: string[];
}

/** Idea projects start and retry against an accepted quote. */
export interface IAcceptTurboProjectQuoteInput {
  quoteId?: string;
}

export type TurboProjectReviewDecision = 'approved' | 'rejected';

export interface IReviewTurboProjectItemsInput {
  itemIds: string[];
  decision: TurboProjectReviewDecision;
}

export interface IScheduleTurboProjectInput {
  targets: Array<{
    credentialId: string;
    platform: string;
    scheduledDate?: string;
  }>;
  /** Caption per item id; falls back to the item caption. */
  captions?: Record<string, string>;
  timezone?: string;
}

export interface IScheduleTurboProjectResult {
  scheduledCount: number;
  failedCount: number;
}
