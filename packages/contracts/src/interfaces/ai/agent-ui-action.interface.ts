import type { PostVisibility } from '../..';
import type { HeyGenAvatarRef } from '../integrations/heygen.interface';
import type { KnowledgeReceipt } from '../knowledge-base/knowledge-retrieval.interface';
import type { IBrandAgentConfig } from '../organization/brand.interface';
import type { TextReceiptState } from './text-action.interface';
export interface AgentMutationApprovalItem {
  label: string;
  value: string;
}

/** One account's draft as it will read on its platform, for the approval card. */
export interface AgentMutationApprovalPostPreview {
  caption: string;
  credentialId?: string;
  mediaUrls: string[];
  platform: string;
}

export type AgentMutationExecutionStatus =
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'running';

function isApprovalStatus(
  value: unknown,
): value is AgentMutationApprovalData['status'] {
  return value === 'approved' || value === 'declined' || value === 'pending';
}

function isExecutionStatus(
  value: unknown,
): value is AgentMutationExecutionStatus {
  return (
    value === 'cancelled' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'running'
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isApprovalItem(value: unknown): value is AgentMutationApprovalItem {
  return (
    isPlainRecord(value) &&
    typeof value.label === 'string' &&
    typeof value.value === 'string'
  );
}

/**
 * A stored approval card's `data`, read back from JSON: the fields every
 * approval carries are checked, the rest pass through. Null when it is not an
 * approval.
 */
export function readAgentMutationApprovalData(
  value: unknown,
): (AgentMutationApprovalData & Record<string, unknown>) | null {
  if (
    !isPlainRecord(value) ||
    typeof value.approvalId !== 'string' ||
    typeof value.sourceActionId !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    !(typeof value.brandId === 'string' || value.brandId === null) ||
    !Array.isArray(value.items) ||
    !value.items.every(isApprovalItem) ||
    !isApprovalStatus(value.status)
  ) {
    return null;
  }
  const { executionStatus, ...rest } = value;
  return {
    ...rest,
    approvalId: value.approvalId,
    brandId: value.brandId,
    expiresAt: value.expiresAt,
    items: value.items,
    sourceActionId: value.sourceActionId,
    status: value.status,
    summary: value.summary,
    ...(isExecutionStatus(executionStatus) ? { executionStatus } : {}),
  };
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
  estimatedCredits?: number;
  /** Set for `create_post`: the draft per target, so the card can render the platform preview. */
  postPreviews?: AgentMutationApprovalPostPreview[];
  /** `running` once approved and dispatched, until the action settles. */
  executionStatus?: AgentMutationExecutionStatus;
  error?: string;
  /** Set on a fresh preview that replaces this source card's approval. */
  replacesSourceActionId?: string;
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
  scope: 'inbox' | 'turboRun' | 'summary';
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

export type AgentClipperRunIdentityField = 'avatar' | 'voice';

export type AgentClipperRunIdentitySource =
  | 'brand'
  | 'explicit'
  | 'missing'
  | 'organization';

export interface AgentClipperRunIdentity {
  avatarRef?: HeyGenAvatarRef;
  voiceRef?: NonNullable<IBrandAgentConfig['defaultVoiceRef']>;
  avatarId?: string;
  avatarProvider?: string;
  isComplete: boolean;
  label: string;
  missing: AgentClipperRunIdentityField[];
  source: AgentClipperRunIdentitySource;
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

/** ClipperRunStep — one step in the clip run lifecycle. */
export interface ClipperRunStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  outputUrl?: string;
  errorMessage?: string;
  retryable: boolean;
}

/** Mode toggles the user can change mid-run. */
export interface ClipperRunModes {
  enableMerge: boolean;
  enableReframe: boolean;
  confirmBeforePublish: boolean;
  platform: 'twitter' | 'instagram' | 'tiktok';
  duration: 15 | 30 | 60;
  aspectRatio: '16:9' | '9:16' | '1:1';
}

/** The clip-run card state the agent tool emits. */
export interface ClipperRunCardState {
  clipperProjectId: string;
  organizationId: string;
  brandId: string;
  currentStep: string;
  steps: ClipperRunStep[];
  modes: ClipperRunModes;
  identity?: AgentClipperRunIdentity;
  finalOutputUrl?: string;
  status: 'idle' | 'running' | 'paused' | 'done' | 'failed';
  confirmationPending?: boolean;
  confirmationMessage?: string;
}

/** The run a `clipper_workflow_run_card` starts. */
export interface AgentClipperRunRequest {
  autonomousMode?: boolean;
  durationSeconds?: number;
  format?: 'landscape' | 'portrait' | 'square';
  identity?: AgentClipperRunIdentity;
  inputValues?: Record<string, unknown>;
  mergeGeneratedVideos?: boolean;
  model?: string;
  prompt?: string;
  requireStepConfirmation?: boolean;
}

/** One row on a list card (review queue, ad results, turbo-run previews). */
export interface AgentUiActionItem {
  id: string;
  title: string;
  brandId?: string | null;
  credentialId?: string;
  platform?: string;
  previewUrl?: string;
  type?: string;
}

export interface AgentUiActionWorkflowOption {
  id: string;
  name: string;
  description?: string;
  status?: string;
}

export interface AgentIngredientAlternative {
  label: string;
  prompt: string;
  generationType: 'image' | 'video';
}

export interface AgentEngagementOriginalPost {
  author: string;
  content: string;
  platform?: string;
  url?: string;
}

export interface AgentOnboardingChecklistItem {
  id: string;
  label: string;
  isCompleted: boolean;
  rewardCredits?: number;
  isClaimed?: boolean;
  isRecommended?: boolean;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface AgentTrendingTopic {
  id: string;
  label: string;
  score?: number;
  platform?: string;
}

export interface AgentCalendarDay {
  date: string;
  postCount: number;
}

export interface AgentExistingVoice {
  id: string;
  label: string;
  provider?: string;
  cloneStatus?: string;
}

export type AgentContentFormat =
  | 'article'
  | 'generic'
  | 'newsletter'
  | 'social_post'
  | 'thread';

/**
 * Fields every card carries. `type` is the discriminant: narrow on it (or take
 * `AgentUiActionOf<'…_card'>`) to reach the fields that card needs.
 */
export interface AgentUiActionBase<TType extends string = AgentUiActionType> {
  id: string;
  type: TType;
  title: string;
  description?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresConfirmation?: boolean;
  ctas?: AgentUiActionCta[];
  data?: Record<string, unknown>;
  /** Lifecycle status the thread sets on any card while its action runs. */
  status?: string;
}

export interface AgentMutationApprovalCardAction
  extends AgentUiActionBase<'mutation_approval_card'> {
  /** Other keys may be stamped on by the thread (e.g. `sourceGenerationActionId`). */
  data: AgentMutationApprovalData & Record<string, unknown>;
}

export interface AgentOAuthConnectCardAction
  extends AgentUiActionBase<'oauth_connect_card'> {
  /** A single-platform card. */
  platform?: string;
  /** A collapsed card offering several platforms. */
  platforms?: string[];
}

export interface AgentContentPreviewCardAction
  extends AgentUiActionBase<'content_preview_card'> {
  assetId?: string;
  assetKind?: 'image' | 'video' | 'voice';
  audio?: string[];
  brandId?: string | null;
  /** Branded-generation receipt behind this written proposal. */
  brandedReceipt?: AgentUiBrandedReceipt;
  contentFormat?: AgentContentFormat;
  credentialId?: string;
  images?: string[];
  /** Exact source versions whose passages grounded this generated output. */
  knowledgeReceipts?: KnowledgeReceipt[];
  platform?: string;
  preheader?: string;
  subject?: string;
  textContent?: string;
  tweets?: string[];
  videos?: string[];
}

export interface AgentCompletionSummaryCardAction
  extends AgentUiActionBase<'completion_summary_card'> {
  summaryText: string;
  outcomeBullets?: string[];
  outputVariants?: AgentUiActionOutputVariant[];
  primaryCta?: AgentUiActionCta;
  secondaryCtas?: AgentUiActionCta[];
  utilityCtas?: AgentUiActionCta[];
}

export interface AgentImageTransformCardAction
  extends AgentUiActionBase<'image_transform_card'> {
  images?: string[];
}

export type AgentOutreachSequenceCreateCardAction =
  AgentUiActionBase<'outreach_sequence_create_card'>;

export type AgentOutreachSequenceControlCardAction =
  AgentUiActionBase<'outreach_sequence_control_card'>;

export interface AgentAnalyticsSnapshotCardAction
  extends AgentUiActionBase<'analytics_snapshot_card'> {
  metrics?: Record<string, unknown>;
}

export interface AgentPublishPostCardAction
  extends AgentUiActionBase<'publish_post_card'> {
  contentId?: string;
  platforms?: string[];
  scheduledAt?: string;
  /** Per-channel scheduler destinations. */
  targets?: AgentPublishTargetProposal[];
  textContent?: string;
  visibility?: PostVisibility;
}

export interface AgentReviewGateCardAction
  extends AgentUiActionBase<'review_gate_card'> {
  items: AgentUiActionItem[];
}

export interface AgentGenerationActionCardAction
  extends AgentUiActionBase<'generation_action_card'> {
  generationType: 'image' | 'video';
  generationParams?: AgentGenerationActionParams;
}

export interface AgentIngredientPickerCardAction
  extends AgentUiActionBase<'ingredient_picker_card'> {
  ingredients: AgentIngredientItem[];
}

export interface AgentWorkflowTriggerCardAction
  extends AgentUiActionBase<'workflow_trigger_card'> {
  workflows: AgentUiActionWorkflowOption[];
}

export interface AgentClipperWorkflowRunCardAction
  extends AgentUiActionBase<'clipper_workflow_run_card'> {
  brandId?: string;
  clipperRun: AgentClipperRunRequest;
  clipperRunState?: ClipperRunCardState;
  workflowDescription?: string;
  workflowId?: string;
  workflowName?: string;
  workflows: AgentUiActionWorkflowOption[];
}

export interface AgentClipperRunCardAction
  extends AgentUiActionBase<'clipper_run_card'> {
  clipperRunState?: ClipperRunCardState;
}

export interface AgentIngredientAlternativesCardAction
  extends AgentUiActionBase<'ingredient_alternatives_card'> {
  alternatives: AgentIngredientAlternative[];
}

export interface AgentSchedulePostCardAction
  extends AgentUiActionBase<'schedule_post_card'> {
  contentId?: string;
  creditEstimate?: number;
  platforms?: string[];
  scheduledAt?: string;
  targets?: AgentPublishTargetProposal[];
}

export interface AgentEngagementOpportunityCardAction
  extends AgentUiActionBase<'engagement_opportunity_card'> {
  draftReply?: string;
  originalPost?: AgentEngagementOriginalPost;
}

export interface AgentOnboardingChecklistCardAction
  extends AgentUiActionBase<'onboarding_checklist_card'> {
  checklist: AgentOnboardingChecklistItem[];
  completionPercent: number;
  earnedCredits?: number;
  journeyEarnedCredits?: number;
  journeyRemainingCredits?: number;
  signupGiftCredits?: number;
  totalJourneyCredits?: number;
  totalOnboardingCreditsVisible?: number;
}

export interface AgentCreditsBalanceCardAction
  extends AgentUiActionBase<'credits_balance_card'> {
  balance?: number;
  usageLabel?: string;
  usagePercent?: number;
}

export interface AgentStudioHandoffCardAction
  extends AgentUiActionBase<'studio_handoff_card'> {
  editorType: string;
  studioUrl: string;
  thumbnailUrl?: string;
}

export interface AgentBrandCreateCardAction
  extends AgentUiActionBase<'brand_create_card'> {
  brandDescription?: string;
  brandName?: string;
}

export type AgentBrandIdentityConfirmationCardAction =
  AgentUiActionBase<'brand_identity_confirmation_card'>;

export interface AgentWorkflowExecuteCardAction
  extends AgentUiActionBase<'workflow_execute_card'> {
  creditEstimate?: number;
  workflowDescription?: string;
  workflowId?: string;
  workflowName?: string;
}

export interface AgentTrendingTopicsCardAction
  extends AgentUiActionBase<'trending_topics_card'> {
  trends?: AgentTrendingTopic[];
}

export interface AgentContentCalendarCardAction
  extends AgentUiActionBase<'content_calendar_card'> {
  calendarDays?: AgentCalendarDay[];
}

export interface AgentTurboRunCardAction
  extends AgentUiActionBase<'turbo_run_card'> {
  creditEstimate?: number;
  platforms?: string[];
  turboRunCount?: number;
}

export interface AgentTurboRunResultCardAction
  extends AgentUiActionBase<'turbo_run_result_card'> {
  brandId?: string | null;
  completedCount: number;
  credentialId?: string;
  creditsUsed?: number;
  failedCount?: number;
  items?: AgentUiActionItem[];
  platform?: string;
  platforms: string[];
  /** Completed posts not shown in the max-3 preview strip. */
  remainingCount?: number;
  turboRunCount?: number;
}

export interface AgentVoiceCloneCardAction
  extends AgentUiActionBase<'voice_clone_card'> {
  audioUrl?: string;
  brandId?: string | null;
  canUpload: boolean;
  canUseExisting: boolean;
  cloneProgress?: number;
  existingVoices: AgentExistingVoice[];
  recommendedVoiceId?: string;
  voiceoverText?: string;
}

export interface AgentBrandVoiceProfileCardAction
  extends AgentUiActionBase<'brand_voice_profile_card'> {
  brandId?: string | null;
  textContent?: string;
}

export interface AgentAiTextActionCardAction
  extends AgentUiActionBase<'ai_text_action_card'> {
  textActions?: string[];
  textContent?: string;
}

export interface AgentAdsSearchResultsCardAction
  extends AgentUiActionBase<'ads_search_results_card'> {
  items: AgentUiActionItem[];
  metrics?: Record<string, unknown>;
}

export type AgentAdDetailSummaryCardAction =
  AgentUiActionBase<'ad_detail_summary_card'>;

export type AgentCampaignLaunchPrepCardAction =
  AgentUiActionBase<'campaign_launch_prep_card'>;

export interface AgentWorkflowCreatedCardAction
  extends AgentUiActionBase<'workflow_created_card'> {
  nextRunAt?: string;
  scheduleSummary?: string;
  workflowDescription?: string;
  workflowId?: string;
  workflowName: string;
}

/** Shared by `bot_created_card` and `livestream_bot_status_card`. */
export interface AgentLivestreamBotFields {
  botId: string;
  botName: string;
  brandId?: string | null;
  platform: string;
  sessionStatus?: string;
}

export interface AgentBotCreatedCardAction
  extends AgentUiActionBase<'bot_created_card'>,
    AgentLivestreamBotFields {}

export interface AgentLivestreamBotStatusCardAction
  extends AgentUiActionBase<'livestream_bot_status_card'>,
    AgentLivestreamBotFields {}

export interface AgentNextStepsCardAction
  extends AgentUiActionBase<'next_steps_card'> {
  nextSteps: AgentNextStepOption[];
}

export type AgentBrandInterviewOfferCardAction =
  AgentUiActionBase<'brand_interview_offer_card'>;

export type AgentBrandInterviewCompleteCardAction =
  AgentUiActionBase<'brand_interview_complete_card'>;

export type AgentTransferCardAction = AgentUiActionBase<'agent_transfer_card'>;

/**
 * A card the agent attaches to a reply, keyed by `type`. Each member carries
 * only the fields its card renders; narrow on `type` to read them.
 */
export type AgentUiAction =
  | AgentMutationApprovalCardAction
  | AgentOAuthConnectCardAction
  | AgentContentPreviewCardAction
  | AgentCompletionSummaryCardAction
  | AgentImageTransformCardAction
  | AgentOutreachSequenceCreateCardAction
  | AgentOutreachSequenceControlCardAction
  | AgentAnalyticsSnapshotCardAction
  | AgentPublishPostCardAction
  | AgentReviewGateCardAction
  | AgentGenerationActionCardAction
  | AgentIngredientPickerCardAction
  | AgentWorkflowTriggerCardAction
  | AgentClipperWorkflowRunCardAction
  | AgentClipperRunCardAction
  | AgentIngredientAlternativesCardAction
  | AgentSchedulePostCardAction
  | AgentEngagementOpportunityCardAction
  | AgentOnboardingChecklistCardAction
  | AgentCreditsBalanceCardAction
  | AgentStudioHandoffCardAction
  | AgentBrandCreateCardAction
  | AgentBrandIdentityConfirmationCardAction
  | AgentWorkflowExecuteCardAction
  | AgentTrendingTopicsCardAction
  | AgentContentCalendarCardAction
  | AgentTurboRunCardAction
  | AgentTurboRunResultCardAction
  | AgentVoiceCloneCardAction
  | AgentBrandVoiceProfileCardAction
  | AgentAiTextActionCardAction
  | AgentAdsSearchResultsCardAction
  | AgentAdDetailSummaryCardAction
  | AgentCampaignLaunchPrepCardAction
  | AgentWorkflowCreatedCardAction
  | AgentBotCreatedCardAction
  | AgentNextStepsCardAction
  | AgentLivestreamBotStatusCardAction
  | AgentBrandInterviewOfferCardAction
  | AgentBrandInterviewCompleteCardAction
  | AgentTransferCardAction;

export type AgentUiActionType = AgentUiAction['type'];

/** The card a given `type` names. */
export type AgentUiActionOf<TType extends AgentUiActionType> = Extract<
  AgentUiAction,
  { type: TType }
>;

/** A guard for one card type, for `find` / `filter` over a turn's cards. */
export function isAgentUiActionOf<TType extends AgentUiActionType>(
  type: TType,
): (action: AgentUiAction) => action is AgentUiActionOf<TType> {
  return (action): action is AgentUiActionOf<TType> => action.type === type;
}

/** `action` with `extra` merged into its `data`. */
export function mergeAgentUiActionData<TAction extends AgentUiAction>(
  action: TAction,
  extra: Record<string, unknown>,
): TAction {
  return { ...action, data: { ...action.data, ...extra } };
}

function overlaySameType<TAction extends AgentUiAction>(
  card: TAction,
  update: TAction,
  isDataMerged: boolean,
): TAction {
  return isDataMerged
    ? { ...card, ...update, data: { ...card.data, ...update.data } }
    : { ...card, ...update };
}

/**
 * `update` laid over `card`. Only a card of the same type merges (its `data`
 * key by key when `isDataMerged`); a card of another type replaces it whole.
 */
export function overlayAgentUiAction(
  card: AgentUiAction,
  update: AgentUiAction,
  { isDataMerged = false }: { isDataMerged?: boolean } = {},
): AgentUiAction {
  return card.type === update.type
    ? overlaySameType(card, update, isDataMerged)
    : update;
}

/** The receipt a text proposal was written under: its id and whether the brand kit was approved. */
export interface AgentUiBrandedReceipt {
  id: string;
  state: TextReceiptState;
}
