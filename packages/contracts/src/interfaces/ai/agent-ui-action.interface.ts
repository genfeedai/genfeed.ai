export type AgentUiActionType =
  | 'mutation_approval_card'
  | 'oauth_connect_card'
  | 'content_preview_card'
  | 'completion_summary_card'
  | 'payment_cta_card'
  | 'image_transform_card'
  | 'outreach_sequence_create_card'
  | 'outreach_sequence_control_card'
  | 'analytics_snapshot_card'
  | 'publish_post_card'
  | 'review_gate_card'
  | 'generation_action_card'
  | 'ingredient_picker_card'
  | 'workflow_trigger_card'
  | 'clip_workflow_run_card'
  | 'clip_run_card'
  | 'ingredient_alternatives_card'
  | 'schedule_post_card'
  | 'engagement_opportunity_card'
  | 'onboarding_checklist_card'
  | 'credits_balance_card'
  | 'studio_handoff_card'
  | 'brand_create_card'
  | 'brand_identity_confirmation_card'
  | 'workflow_execute_card'
  | 'trending_topics_card'
  | 'content_calendar_card'
  | 'batch_generation_card'
  | 'batch_generation_result_card'
  | 'voice_clone_card'
  | 'brand_voice_profile_card'
  | 'ai_text_action_card'
  | 'ads_search_results_card'
  | 'ad_detail_summary_card'
  | 'campaign_launch_prep_card'
  | 'workflow_created_card'
  | 'bot_created_card'
  | 'next_steps_card'
  | 'livestream_bot_status_card'
  | 'brand_interview_offer_card'
  | 'brand_interview_complete_card'
  | 'agent_transfer_card';

export interface AgentMutationApprovalItem {
  label: string;
  value: string;
}

export interface AgentMutationApprovalData {
  approvalId: string;
  sourceActionId: string;
  summary: string;
  items: AgentMutationApprovalItem[];
  status: 'pending' | 'approved' | 'declined';
  scopeVersion?: number;
  brandId: string | null;
  expiresAt: string;
  executionStatus?: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface AgentUiActionBase {
  id: string;
  type: AgentUiActionType;
  title: string;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
}

export interface AgentUiActionCta {
  label: string;
  href?: string;
  action?: string;
  payload?: Record<string, unknown>;
}

export interface AgentCompletionSuggestedAction {
  id: string;
  label: string;
  prompt: string;
  /** Optional one-line helper; omit for chip-style short labels. */
  description?: string;
}

export interface AgentCompletionToolCall {
  reviewQueue?: AgentReviewQueueSnapshot;
  status: 'completed' | 'failed';
  toolName: string;
}

/** Verified counts used to ground review follow-ups in the latest tool result. */
export interface AgentReviewQueueSnapshot {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  scope: 'inbox' | 'batch' | 'summary';
}

/**
 * What a UI action handler reports back to the card that invoked it.
 * `true`: the action finished. `false`: it was rejected or failed.
 * `'pending'`: the server accepted it, but its result has not arrived yet, so
 * the card must stay in its in-flight state rather than show success or error.
 */
export type AgentUiActionOutcome = boolean | 'pending';

export type AgentUiActionHandler = (
  action: string,
  payload?: Record<string, unknown>,
) =>
  | AgentUiActionOutcome
  | void
  | Promise<AgentUiActionOutcome | undefined>
  | Promise<void>;

export type AgentThreadUiActionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * One ui-action run on a thread, as the thread projection records it from the
 * run's own events: opened when it is queued (or started), settled by its own
 * terminal event. Runs are kept by run id, so queuing the same action on the
 * same source again never erases an earlier run.
 */
export interface AgentThreadUiActionRun {
  action: string;
  error?: string;
  /** Sequence of the event that queued (or started) the run. */
  queuedSequence: number;
  runId: string;
  /** The card or item the action acts on (see `getAgentUiActionSourceId`). */
  sourceId: string;
  status: AgentThreadUiActionStatus;
  /** Sequence of the run's terminal event, once it has one. */
  terminalSequence?: number;
  updatedAt: string;
}

/**
 * What a card shows for one action on one source, derived from that source's
 * runs by `deriveAgentUiActionStates`.
 */
export interface AgentThreadUiActionState {
  action: string;
  error?: string;
  /** The run the state is taken from. */
  runId: string;
  /** Its terminal sequence once settled, else its queued sequence. */
  sequence: number;
  sourceId: string;
  status: AgentThreadUiActionStatus;
  updatedAt: string;
}

function toUiActionState(
  run: AgentThreadUiActionRun,
): AgentThreadUiActionState {
  return {
    action: run.action,
    ...(run.error ? { error: run.error } : {}),
    runId: run.runId,
    sequence: run.terminalSequence ?? run.queuedSequence,
    sourceId: run.sourceId,
    status: run.status,
    updatedAt: run.updatedAt,
  };
}

function latestBy(
  runs: readonly AgentThreadUiActionRun[],
  sequenceOf: (run: AgentThreadUiActionRun) => number,
): AgentThreadUiActionRun | undefined {
  let latest: AgentThreadUiActionRun | undefined;
  for (const run of runs) {
    if (!latest || sequenceOf(run) > sequenceOf(latest)) {
      latest = run;
    }
  }
  return latest;
}

/**
 * The settled run whose outcome a card shows: the latest completed run, else
 * the latest settled one. The thread lane executes runs in queue order, so
 * completed runs are ordered by their queued sequence (a settlement recovered
 * without its terminal sequence still orders correctly); settled runs that
 * never executed (a queued run cancelled) are ordered by their terminal event.
 */
function selectSettledUiActionRun(
  runs: readonly AgentThreadUiActionRun[],
): AgentThreadUiActionRun | undefined {
  return (
    latestBy(
      runs.filter((run) => run.status === 'completed'),
      (run) => run.queuedSequence,
    ) ??
    latestBy(
      runs.filter((run) => run.status !== 'pending'),
      (run) => run.terminalSequence ?? run.queuedSequence,
    )
  );
}

/**
 * The per-card view of a thread's ui-action runs, keyed by
 * `getAgentUiActionStateKey(action, sourceId)`:
 * - while any run of that action on that source is pending, the latest
 *   queued of them (the card is in flight);
 * - otherwise the latest completed run: a later failure (an "already
 *   approved" duplicate, a declined retry) never overrides an earlier
 *   successful execution of the same source;
 * - otherwise the latest settled run (failed or cancelled).
 * The server projection and the client both derive cards with this rule.
 */
export function deriveAgentUiActionStates(
  runs: readonly AgentThreadUiActionRun[],
): Record<string, AgentThreadUiActionState> {
  const runsByKey = new Map<string, AgentThreadUiActionRun[]>();
  for (const run of runs) {
    const key = getAgentUiActionStateKey(run.action, run.sourceId);
    runsByKey.set(key, [...(runsByKey.get(key) ?? []), run]);
  }
  const states: Record<string, AgentThreadUiActionState> = {};
  for (const [key, keyRuns] of runsByKey) {
    const chosen =
      latestBy(
        keyRuns.filter((run) => run.status === 'pending'),
        (run) => run.queuedSequence,
      ) ?? selectSettledUiActionRun(keyRuns);
    if (chosen) {
      states[key] = toUiActionState(chosen);
    }
  }
  return states;
}

/**
 * Whether a settled run's result may update its source card: the run is the
 * one whose outcome the source shows under the `deriveAgentUiActionStates`
 * rule, among the source's settled runs (of any action, since they all
 * resolve the same card). So an older run's result arriving late never
 * overwrites the card a newer run resolved, and a run that did not complete
 * (an "already approved" duplicate) never overwrites a completed one. A run
 * still queued resolves the card after this one, so it never blocks it.
 * A result for a run the thread does not track applies unless a tracked run
 * already resolved the source with a later terminal event.
 */
export function isAgentUiActionSourceOwner(
  runs: readonly AgentThreadUiActionRun[],
  result: { runId: string; sequence?: number; sourceId: string },
): boolean {
  const settledOnSource = runs.filter(
    (run) => run.sourceId === result.sourceId && run.status !== 'pending',
  );
  if (!runs.some((run) => run.runId === result.runId)) {
    const sequence = result.sequence;
    return (
      typeof sequence !== 'number' ||
      !settledOnSource.some(
        (run) =>
          typeof run.terminalSequence === 'number' &&
          run.terminalSequence > sequence,
      )
    );
  }
  return selectSettledUiActionRun(settledOnSource)?.runId === result.runId;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The card or item a ui-action acts on: its source card id, else the plan it
 * reviews, else its payload. Key order is normalized, so the server (after a
 * JSON round trip) and the client derive the same id.
 */
export function getAgentUiActionSourceId(
  payload: Record<string, unknown> | undefined,
): string {
  if (typeof payload?.sourceActionId === 'string') {
    return payload.sourceActionId;
  }
  if (typeof payload?.planId === 'string') {
    return payload.planId;
  }
  return stableSerialize(payload ?? {});
}

export function getAgentUiActionStateKey(
  action: string,
  sourceId: string,
): string {
  return `${action}:${sourceId}`;
}

export type AgentPublishTargetMediaKind =
  | 'carousel'
  | 'image'
  | 'link'
  | 'short_video'
  | 'video';

export type AgentPublishSettingFieldType =
  | 'boolean'
  | 'multi_select'
  | 'number'
  | 'select'
  | 'string'
  | 'text'
  | 'url';

export interface AgentPublishTargetMedia {
  id?: string;
  isAnimated?: boolean;
  kind: AgentPublishTargetMediaKind;
}

export interface AgentPublishValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface AgentPublishSettingOption {
  label: string;
  value: string;
}

export interface AgentPublishSettingField {
  defaultValue?: boolean | number | string | string[];
  description?: string;
  key: string;
  label: string;
  options?: AgentPublishSettingOption[];
  required?: boolean;
  type: AgentPublishSettingFieldType;
}

/**
 * One scheduler destination inside a `publish_post_card`. The shared caption
 * and visibility live on the parent action; each target carries the effective
 * per-channel override, capability-driven settings, and validation blockers.
 */
export interface AgentPublishTargetProposal {
  blockers: AgentPublishValidationIssue[];
  caption?: string;
  captionMaxLength?: number;
  credentialId: string;
  id: string;
  isCaptionRequired?: boolean;
  isSelected?: boolean;
  label: string;
  media?: AgentPublishTargetMedia[];
  platform: string;
  referenceState?: string;
  scheduledAt?: string;
  settingFields?: AgentPublishSettingField[];
  settings: Record<string, unknown>;
  signatureIds?: string[];
  timezone?: string;
  visibility: PostVisibility;
  warnings?: AgentPublishValidationIssue[];
}

export interface AgentUiActionOutputVariant {
  id: string;
  kind: 'audio' | 'image' | 'text' | 'video';
  textContent?: string;
  threadSegments?: string[];
  thumbnailUrl?: string;
  title?: string;
  url?: string;
}

/**
 * One choice the agent offers the user. Every option carries its own CTAs so a
 * suggestion always renders a control — either navigation to the owning page or
 * an in-conversation follow-up — never bare prose the user cannot act on.
 */
export interface AgentNextStepOption {
  id: string;
  title: string;
  description?: string;
  ctas: AgentUiActionCta[];
}

export interface AgentIngredientItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video';
  title?: string;
}

export type AgentClipRunIdentityField = 'avatar' | 'voice';

export type AgentClipRunIdentitySource =
  | 'brand'
  | 'explicit'
  | 'missing'
  | 'organization';

export interface AgentClipRunIdentity {
  avatarId?: string;
  avatarProvider?: string;
  isComplete: boolean;
  label: string;
  missing: AgentClipRunIdentityField[];
  source: AgentClipRunIdentitySource;
  useIdentity: boolean;
  voiceId?: string;
  voiceProvider?: string;
}

/**
 * Payload on a `generation_action_card`. Identity fields match the Agent →
 * Studio handoff (`AgentStudioHandoffPayload`): `useIdentity` marks a
 * `generate_as_identity` card, and `avatarPhotoUrl` / `voiceId` carry a
 * snapshot when the sender already resolved them.
 */
export interface AgentGenerationActionParams {
  requestedSkillSlugs?: string[];
  harness?: boolean;
  aspectRatio?: string;
  avatarPhotoUrl?: string;
  duration?: number;
  endFrame?: string;
  model?: string;
  outputs?: number;
  prioritize?: string;
  prompt?: string;
  references?: string[];
  resolution?: string;
  /**
   * True when this card originated from an identity generation
   * (`generate_as_identity`). Open in Studio then snapshots the brand
   * identity's avatar and voice (#4717).
   */
  useIdentity?: boolean;
  videoReferences?: string[];
  voiceId?: string;
}

export interface AgentUiAction extends AgentUiActionBase {
  assetId?: string;
  assetKind?: 'image' | 'video' | 'voice';
  ctas?: AgentUiActionCta[];
  data?: Record<string, unknown>;
  contentFormat?:
    | 'article'
    | 'generic'
    | 'newsletter'
    | 'social_post'
    | 'thread';
  platform?: string;
  subject?: string;
  preheader?: string;
  images?: string[];
  videos?: string[];
  audio?: string[];
  voiceoverText?: string;
  tweets?: string[];
  packs?: Array<{ label: string; price: string; credits: number }>;
  metrics?: Record<string, unknown>;
  status?: string;
  summaryText?: string;
  outcomeBullets?: string[];
  items?: Array<{
    id: string;
    title: string;
    type?: string;
    platform?: string;
    previewUrl?: string;
  }>;
  generationType?: 'image' | 'video';
  generationParams?: AgentGenerationActionParams;
  ingredients?: AgentIngredientItem[];
  workflows?: {
    id: string;
    name: string;
    description?: string;
    status?: string;
  }[];
  outputVariants?: AgentUiActionOutputVariant[];
  clipRun?: {
    autonomousMode?: boolean;
    durationSeconds?: number;
    format?: 'landscape' | 'portrait' | 'square';
    identity?: AgentClipRunIdentity;
    inputValues?: Record<string, unknown>;
    mergeGeneratedVideos?: boolean;
    model?: string;
    prompt?: string;
    requireStepConfirmation?: boolean;
  };
  clipRunState?: Record<string, unknown>;
  alternatives?: {
    label: string;
    prompt: string;
    generationType: 'image' | 'video';
  }[];
  scheduledAt?: string;
  platforms?: string[];
  /** Per-channel scheduler destinations for a `publish_post_card`. */
  targets?: AgentPublishTargetProposal[];
  visibility?: PostVisibility;
  creditEstimate?: number;
  originalPost?: {
    author: string;
    content: string;
    platform?: string;
    url?: string;
  };
  draftReply?: string;
  checklist?: {
    id: string;
    label: string;
    isCompleted: boolean;
    rewardCredits?: number;
    isClaimed?: boolean;
    isRecommended?: boolean;
    description?: string;
    ctaLabel?: string;
    ctaHref?: string;
  }[];
  earnedCredits?: number;
  totalJourneyCredits?: number;
  completionPercent?: number;
  balance?: number;
  usagePercent?: number;
  usageLabel?: string;
  signupGiftCredits?: number;
  journeyEarnedCredits?: number;
  journeyRemainingCredits?: number;
  totalOnboardingCreditsVisible?: number;
  thumbnailUrl?: string;
  editorType?: string;
  studioUrl?: string;
  brandName?: string;
  brandDescription?: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  primaryCta?: AgentUiActionCta;
  secondaryCtas?: AgentUiActionCta[];
  utilityCtas?: AgentUiActionCta[];
  contentId?: string;
  scheduleSummary?: string;
  nextRunAt?: string;
  botId?: string;
  botName?: string;
  sessionStatus?: string;
  trends?: {
    id: string;
    label: string;
    score?: number;
    platform?: string;
  }[];
  calendarDays?: {
    date: string;
    postCount: number;
  }[];
  batchCount?: number;
  completedCount?: number;
  failedCount?: number;
  creditsUsed?: number;
  /** Completed posts not shown in the max-3 preview strip. */
  remainingCount?: number;
  audioUrl?: string;
  cloneProgress?: number;
  brandId?: string;
  recommendedVoiceId?: string;
  canUpload?: boolean;
  canUseExisting?: boolean;
  existingVoices?: Array<{
    id: string;
    label: string;
    provider?: string;
    cloneStatus?: string;
  }>;
  textContent?: string;
  textActions?: string[];
  nextSteps?: AgentNextStepOption[];
  /** Exact source versions whose passages grounded this generated output. */
  knowledgeReceipts?: KnowledgeReceipt[];
}

import type { PostVisibility } from '../..';
import type { KnowledgeReceipt } from '../knowledge-base/knowledge-retrieval.interface';
