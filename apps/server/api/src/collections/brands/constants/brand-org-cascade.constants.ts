/**
 * Brand → Organization relocation cascade configuration.
 *
 * A brand is NOT self-contained: the schema denormalizes `organizationId` across
 * many tables that also carry a brand key. Moving only `Brand.organizationId`
 * leaves those rows stamped with the old org — invisible to the destination org's
 * tenant-scoped reads (which filter by `organizationId` directly), yet still
 * reachable by id. This module is the single source of truth for which tables the
 * relocation must rewrite.
 *
 * Correctness rests on THREE mechanisms, in order of trust:
 *   1. FIRST_ORDER_TARGETS  — tables carrying both a brand key and an org key.
 *   2. SECOND_ORDER_TARGETS — org-scoped children with NO brand key, owned by a
 *      first-order parent (would orphan if only the parent moves).
 *   3. The runtime orphan auditor (see brands.service) — after the cascade, it
 *      scans every dual-keyed table and rolls back if ANY brand-owned row still
 *      points at a stale org. This is the backstop for tables static analysis
 *      cannot see (unmanaged FKs, non-standard names, future schema additions).
 *
 * The staleness guard test (brand-org-cascade.spec.ts) parses schema.prisma and
 * fails CI if a new dual-keyed model is added without being listed or excluded.
 *
 * Delegate names are camelCase (Prisma client delegates are `prisma.brandInterview`,
 * NOT `prisma.BrandInterview` — the PascalCase form is `undefined` and would throw).
 */

export interface FirstOrderCascadeTarget {
  /** camelCase Prisma delegate name, e.g. `prisma[delegate].updateMany(...)`. */
  readonly delegate: string;
  /** Physical table name (@@map) — used by the raw-SQL orphan auditor. */
  readonly table: string;
  /** Scalar field on this model that references the Brand. */
  readonly brandField: string;
  /** Scalar org field to rewrite to the destination org. */
  readonly orgField: string;
}

export interface SecondOrderParentLink {
  /** camelCase delegate of the parent whose brand we filter by. */
  readonly parentDelegate: string;
  /** Brand field on the parent (matches a FIRST_ORDER_TARGETS entry). */
  readonly parentBrandField: string;
  /**
   * Relation on the parent that carries the brand field when the parent has no
   * brand key of its own (`WorkflowExecution` reaches its brand through
   * `workflow`). Absent when the parent holds `parentBrandField` directly.
   */
  readonly parentRelation?: string;
  /** Scalar FK on the child pointing at the parent's id. */
  readonly fkField: string;
}

export interface SecondOrderCascadeTarget {
  readonly delegate: string;
  readonly table: string;
  readonly orgField: string;
  /** A child row is relocated if it points at ANY moved parent. */
  readonly parents: readonly SecondOrderParentLink[];
}

/**
 * Models with both a brand key and an org key. Rewrite `orgField` → destination.
 *
 * Excluded on purpose (see KNOWN_EXCLUDED): `Member` (its brand link is
 * `currentBrandId`, a per-user UI pointer — the member row belongs to its own org
 * and must NOT move), `ApiKey` (its `defaultBrandId` is the same kind of
 * per-key preference pointer, not brand-owned content), plus `LlmVendorCost` and
 * `MediaVendorCost` (records whose composite Brand foreign keys cascade atomically
 * with the Brand row instead of being rewritten by the generic target loop).
 * `ContentVersionPin` and `PublishApproval` are immutable by trigger, so a brand
 * that has either is refused before the cascade runs rather than moved.
 *
 * Non-standard field names are hand-mapped: `Asset` (parentBrandId/parentOrgId),
 * `ContextBase` (sourceBrandId), `Lead` (proactiveBrandId → proactiveOrganizationId,
 * NOT its plain `organizationId`, which is the lead-gen org and stays put).
 */
export const FIRST_ORDER_TARGETS: readonly FirstOrderCascadeTarget[] = [
  {
    delegate: 'visualProject',
    table: 'visual_projects',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'visualRevision',
    table: 'visual_revisions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'outlierBaselineSnapshot',
    table: 'outlier_baseline_snapshots',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'outlierPostPerformance',
    table: 'outlier_post_performances',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'brandOsRevision',
    table: 'brand_os_revisions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'brandOsPublication',
    table: 'brand_os_publications',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'engagementRule',
    table: 'engagement_rules',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'rssFeedItem',
    table: 'rss_feed_items',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'rssSource',
    table: 'rss_sources',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'brandInterview',
    table: 'brand_interviews',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'studioLook',
    table: 'studio_looks',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'studioGenerateDraft',
    table: 'studio_generate_drafts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'savedAd',
    table: 'saved_ads',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'moodBoard',
    table: 'mood_boards',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'dashboardLayout',
    table: 'dashboard_layouts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'warmupAccount',
    table: 'warmup_accounts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'workflow',
    table: 'workflows',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'credential',
    table: 'credentials',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialWarmupEnrollment',
    table: 'social_warmup_enrollments',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialWarmupEvent',
    table: 'social_warmup_events',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialWarmupSignal',
    table: 'social_warmup_signals',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'ingredient',
    table: 'ingredients',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'prompt',
    table: 'prompts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'folder',
    table: 'folders',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'tag',
    table: 'tags',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'bookmark',
    table: 'bookmarks',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'asset',
    table: 'assets',
    brandField: 'parentBrandId',
    orgField: 'parentOrgId',
  },
  {
    delegate: 'trackedLink',
    table: 'tracked_links',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'campaign',
    table: 'campaigns',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'campaignPaidActivation',
    table: 'campaign_paid_activations',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'post',
    table: 'posts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'postGroup',
    table: 'post_groups',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'postingSet',
    table: 'posting_sets',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'postingSignature',
    table: 'posting_signatures',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'postAnalytics',
    table: 'post_analytics',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'accountAnalyticsSnapshot',
    table: 'account_analytics_snapshots',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'schedule',
    table: 'schedules',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  // Preserve parent-before-child order because reservations may reference a
  // cadence while both composite tenant stamps are being rewritten.
  {
    delegate: 'postingCadence',
    table: 'posting_cadences',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'slotReservation',
    table: 'slot_reservations',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'distribution',
    table: 'distributions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'article',
    table: 'articles',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'articleAnalytics',
    table: 'article_analytics',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'newsletter',
    table: 'newsletters',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'training',
    table: 'trainings',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'persona',
    table: 'personas',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentMessage',
    table: 'agent_messages',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentThread',
    table: 'agent_threads',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialConversation',
    table: 'social_conversations',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialMessage',
    table: 'social_messages',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialReplyCampaign',
    table: 'social_reply_campaigns',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentStrategy',
    table: 'agent_strategies',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentStrategyOpportunity',
    table: 'agent_strategy_opportunities',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentStrategyReport',
    table: 'agent_strategy_reports',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentCampaign',
    table: 'agent_campaigns',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentGoal',
    table: 'agent_goals',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'agentMemory',
    table: 'agent_memories',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentRun',
    table: 'content_runs',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningAccount',
    table: 'content_learning_accounts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningConsent',
    table: 'content_learning_consents',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningBrandPreference',
    table: 'content_learning_brand_preferences',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningBaseline',
    table: 'content_learning_baselines',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningCheckpoint',
    table: 'content_learning_checkpoints',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningDecision',
    table: 'content_learning_decisions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningReward',
    table: 'content_learning_rewards',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningPolicyVersion',
    table: 'content_learning_policy_versions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningScopeState',
    table: 'content_learning_scope_states',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningOperation',
    table: 'content_learning_operations',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningExperiment',
    table: 'content_learning_experiments',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningEnrollment',
    table: 'content_learning_enrollments',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningOpportunity',
    table: 'content_learning_opportunities',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentLearningExperimentEvent',
    table: 'content_learning_experiment_events',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'task',
    table: 'tasks',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'bot',
    table: 'bots',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'livestreamBotSession',
    table: 'livestream_bot_sessions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'liveSession',
    table: 'live_sessions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'turboProject',
    table: 'turbo_projects',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'botActivity',
    table: 'bot_activities',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'replyBotConfig',
    table: 'reply_bot_configs',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'monitoredAccount',
    table: 'monitored_accounts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'socialSource',
    table: 'social_sources',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'sourcePost',
    table: 'source_posts',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  // The composite post FK follows its parent atomically; keep the defensive
  // rewrite and orphan audit after sourcePost when a brand changes tenant.
  {
    delegate: 'sourcePostNativeAction',
    table: 'source_post_native_actions',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  // Preserve parent-before-child order for the defensive rewrite path because
  // their composite foreign keys include organizationId.
  {
    delegate: 'listeningTopic',
    table: 'listening_topics',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'listeningTopicSource',
    table: 'listening_topic_sources',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'listeningEvidence',
    table: 'listening_evidence',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentPerformance',
    table: 'content_performance',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'creativePattern',
    table: 'creative_patterns',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentPlan',
    table: 'content_plans',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentPlanItem',
    table: 'content_plan_items',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'activity',
    table: 'activities',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'adBulkUploadJob',
    table: 'ad_bulk_upload_jobs',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'adCreativeMapping',
    table: 'ad_creative_mappings',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'adPerformance',
    table: 'ad_performance',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'adWatchedAdvertiser',
    table: 'ad_watched_advertisers',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'trend',
    table: 'trends',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'trendPreferences',
    table: 'trend_preferences',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'trendRemixLineage',
    table: 'trend_remix_lineages',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'listeningTheme',
    table: 'listening_themes',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'listeningSignal',
    table: 'listening_signals',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'outreachCampaign',
    table: 'outreach_campaigns',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'preset',
    table: 'presets',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'clipProject',
    table: 'clip_projects',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'editorProject',
    table: 'editor_projects',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'brandMemory',
    table: 'brand_memories',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contextBase',
    table: 'context_bases',
    brandField: 'sourceBrandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'watchlist',
    table: 'watchlists',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'lead',
    table: 'leads',
    brandField: 'proactiveBrandId',
    orgField: 'proactiveOrganizationId',
  },
  {
    delegate: 'turboRun',
    table: 'turbo_runs',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'turboRunItem',
    table: 'turbo_run_items',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
];

function secondOrderChild(
  delegate: string,
  table: string,
  parent: SecondOrderParentLink,
): SecondOrderCascadeTarget {
  return { delegate, orgField: 'organizationId', parents: [parent], table };
}

/** An execution has no brand key; it reaches its brand through its workflow. */
const EXECUTION_PARENT: SecondOrderParentLink = {
  fkField: 'executionId',
  parentBrandField: 'brandId',
  parentDelegate: 'workflowExecution',
  parentRelation: 'workflow',
};
const THREAD_PARENT: SecondOrderParentLink = {
  fkField: 'threadId',
  parentBrandField: 'brandId',
  parentDelegate: 'agentThread',
};
const POST_PARENT: SecondOrderParentLink = {
  fkField: 'postId',
  parentBrandField: 'brandId',
  parentDelegate: 'post',
};

/**
 * Org-scoped children with no brand key of their own. Their org must follow a moved
 * first-order parent, joined by scalar FK (no relation-name guessing — FK fields are
 * verified against the schema by the staleness test).
 *
 * Intentionally NOT relocated here (org- or execution-level history, ambiguous
 * ownership): `SubscriptionAttribution` (revenue, keyed to the subscriber org),
 * `NotificationEvent` / `NotificationInboxItem` (the recipient's inbox), and
 * `Invitation` (org-level). These stay in the source org by design; see
 * KNOWN_EXCLUDED_MODELS.
 *
 * `WorkflowExecution` hangs off the first-order `Workflow` parent and moves
 * with the brand-owned workflow row. The executor's org-only children
 * (`WorkflowExecutionNodeResult`, `WorkflowArtifact`, `WorkflowNodeClaim`,
 * `WorkflowNodeContinuation`) follow their execution, `WorkflowVersion` follows
 * its workflow (a pinned load fails on an org mismatch), `AgentThread` is
 * first-order and its event/snapshot/context children follow it, and the
 * publish receipt, finalization and media links follow their post, so a retry
 * sees the `uncertain` receipt in the post's new organization.
 */
export const SECOND_ORDER_TARGETS: readonly SecondOrderCascadeTarget[] = [
  {
    delegate: 'turboProjectItem',
    table: 'turbo_project_items',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'turboProject',
        parentBrandField: 'brandId',
        fkField: 'projectId',
      },
    ],
  },
  {
    delegate: 'workflowExecution',
    table: 'workflow_executions',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'workflow',
        parentBrandField: 'brandId',
        fkField: 'workflowId',
      },
    ],
  },
  {
    delegate: 'workflowVersion',
    table: 'workflow_versions',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'workflow',
        parentBrandField: 'brandId',
        fkField: 'workflowId',
      },
    ],
  },
  secondOrderChild(
    'workflowExecutionNodeResult',
    'workflow_execution_node_results',
    EXECUTION_PARENT,
  ),
  secondOrderChild('workflowArtifact', 'workflow_artifacts', EXECUTION_PARENT),
  secondOrderChild(
    'workflowNodeClaim',
    'workflow_node_claims',
    EXECUTION_PARENT,
  ),
  secondOrderChild(
    'workflowNodeContinuation',
    'workflow_node_continuations',
    EXECUTION_PARENT,
  ),
  secondOrderChild('agentThreadEvent', 'agent_thread_events', THREAD_PARENT),
  secondOrderChild(
    'agentThreadSnapshot',
    'agent_thread_snapshots',
    THREAD_PARENT,
  ),
  secondOrderChild(
    'threadContextState',
    'thread_context_states',
    THREAD_PARENT,
  ),
  secondOrderChild(
    'postProviderPublishReceipt',
    'post_provider_publish_receipts',
    POST_PARENT,
  ),
  secondOrderChild(
    'postPublishFinalization',
    'post_publish_finalizations',
    POST_PARENT,
  ),
  // A post's ordered media links carry the post's organization; the link has
  // no brand key of its own, so it follows the post.
  secondOrderChild('postIngredient', 'post_ingredients', POST_PARENT),
  // A character's ordered reference images carry the character's
  // organization; the row has no brand key, so it follows its persona (not the
  // image, which a shared character may take from another brand).
  secondOrderChild('personaReference', 'persona_references', {
    fkField: 'personaId',
    parentBrandField: 'brandId',
    parentDelegate: 'persona',
  }),
  {
    delegate: 'taskComment',
    table: 'task_comments',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'task',
        parentBrandField: 'brandId',
        fkField: 'taskId',
      },
    ],
  },
  {
    delegate: 'contextEntry',
    table: 'context_entries',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'contextBase',
        parentBrandField: 'sourceBrandId',
        fkField: 'contextBaseId',
      },
    ],
  },
  {
    delegate: 'campaignTarget',
    table: 'campaign_targets',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'outreachCampaign',
        parentBrandField: 'brandId',
        fkField: 'campaignId',
      },
    ],
  },
  {
    delegate: 'socialReplyCampaignRecipient',
    table: 'social_reply_campaign_recipients',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'socialReplyCampaign',
        parentBrandField: 'brandId',
        fkField: 'campaignId',
      },
    ],
  },
  {
    delegate: 'model',
    table: 'models',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'training',
        parentBrandField: 'brandId',
        fkField: 'trainingId',
      },
    ],
  },
  {
    delegate: 'caption',
    table: 'captions',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'ingredient',
        parentBrandField: 'brandId',
        fkField: 'ingredientId',
      },
    ],
  },
  {
    delegate: 'mediaModeration',
    table: 'media_moderations',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'ingredient',
        parentBrandField: 'brandId',
        fkField: 'ingredientId',
      },
    ],
  },
  {
    delegate: 'mediaTextDecision',
    table: 'media_text_decisions',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'ingredient',
        parentBrandField: 'brandId',
        fkField: 'ingredientId',
      },
    ],
  },
  {
    delegate: 'mediaPerception',
    table: 'media_perceptions',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'ingredient',
        parentBrandField: 'brandId',
        fkField: 'ingredientId',
      },
    ],
  },
  {
    delegate: 'processedTweet',
    table: 'processed_tweets',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'replyBotConfig',
        parentBrandField: 'brandId',
        fkField: 'replyBotConfigId',
      },
      {
        parentDelegate: 'monitoredAccount',
        parentBrandField: 'brandId',
        fkField: 'monitoredAccountId',
      },
      {
        parentDelegate: 'botActivity',
        parentBrandField: 'brandId',
        fkField: 'botActivityId',
      },
    ],
  },
];

/**
 * Dual-keyed models intentionally NOT in FIRST_ORDER_TARGETS. The staleness test
 * asserts every schema model with a brand+org key is either a first-order target or
 * listed here — so a new one can't slip through unreviewed.
 */
export const KNOWN_EXCLUDED_MODELS: readonly string[] = [
  // Single-column FK to Brand.id, same reasoning as Member.currentBrandId: an
  // API key never moves orgs, so defaultBrandId cannot share the compound
  // (brandId, organizationId) cascade used by brand-owned content (#5219).
  'ApiKey',
  // A relocation receipt retains its source tenant and committed outcome.
  'BrandRelocation',
  // Saved generation receipts, events and member ratings retain immutable tenant ownership.
  'BrandedGenerationFeedback',
  'BrandedGenerationReceipt',
  'BrandedGenerationReceiptEvent',
  // Crun financial history blocks relocation and retains its funding tenant.
  'CrunGenerationTask',
  // Credit ledger history stays with the organization that was billed; its
  // brandId is usage attribution, not brand-owned content.
  'CreditReservation',
  'CreditTransaction',
  // Retained security history blocks relocation, including indirect and deleted audits.
  'AgentPublishAudit',
  'AgentUntrustedContentAudit',
  'AgentTransfer',
  // Immutable by trigger, so a composite-FK cascade would raise; relocation
  // refuses a brand with pins or publish approvals as learning/publication
  // history (assertNoLearningHistory) before the cascade runs.
  'ContentVersionPin',
  'PublishApproval',
  // Immutable Knowledge history blocks relocation before the cascade; its composite Brand FK and ownership trigger also reject concurrent moves.
  'KnowledgeSource',
  'KnowledgeSpace',
  // Composite FKs to its theme and evidence cascade organizationId with them,
  // so it follows the brand; the generic loop has nothing to rewrite.
  'ListeningThemeEvidence',
  'LlmVendorCost',
  'MediaVendorCost',
  'Member',
  // Composite brand foreign keys cascade organizationId with the brand row.
  'BreakoutBaselineReceipt',
  'BreakoutResponse',
  'BreakoutResponseOutput',
  'GenerationPromptSnapshot',
  'PostExposureObservation',
  'Skill',
  'SkillAssignment',
  'SkillGrant',
  'SkillResolution',
  // Append-only by trigger and keyed by composite FK to the execution; a brand
  // with execution read-scope history cannot move (assertNoWorkflowExecutionReadHistory).
  'WorkflowExecutionReadBrandDependency',
  'WorkflowExecutionReadLineage',
  'WorkflowExecutionReadScope',
  // Org-keyed rows that point at a moved parent but belong to another tenant's
  // ledger and stay put: revenue attribution is the subscriber's, and a
  // notification is the recipient's inbox entry.
  'NotificationEvent',
  'NotificationInboxItem',
  'SubscriptionAttribution',
  // Persona grants are revoked, not moved, when their persona's brand changes
  // organization (revokePersonaGrantsForRelocation); the audit trail keeps the
  // owner organization that granted.
  'PersonaAvailabilityAudit',
  'PersonaGrant',
];

/**
 * Physical tables the orphan auditor's "unknown table" scan should ignore, because
 * they are handled elsewhere or intentionally excluded. Everything in
 * FIRST_ORDER_TARGETS is auto-added; these are the extras (excluded models whose org
 * the generic cascade deliberately leaves untouched). Keep in sync with
 * KNOWN_EXCLUDED_MODELS.
 *
 * `workflows` is covered by FIRST_ORDER_TARGETS; execution and batch history follow it
 * via SECOND_ORDER_TARGETS.
 */
export const AUDITOR_IGNORED_TABLES: readonly string[] = [
  'api_keys',
  'brand_relocations',
  'branded_generation_feedback',
  'branded_generation_receipts',
  'branded_generation_receipt_events',
  'crun_generation_tasks',
  'credit_reservations',
  'credit_transactions',
  'agent_publish_audits',
  'agent_untrusted_content_audits',
  'agent_transfers',
  // Immutable pins and publish approvals cannot move: relocation rejects any
  // brand that has them (assertNoLearningHistory).
  'content_version_pins',
  'publish_approvals',
  // These tables cannot move: relocation rejects any live or deleted Knowledge history.
  'knowledge_sources',
  'knowledge_spaces',
  // Follows its theme and evidence through their composite foreign keys.
  'listening_theme_evidence',
  'llm_vendor_costs',
  'media_vendor_costs',
  'members',
  'breakout_baseline_receipts',
  'breakout_response_outputs',
  'breakout_responses',
  'generation_prompt_snapshots',
  'post_exposure_observations',
  'skill_assignments',
  'skill_grants',
  'skill_resolutions',
  'skills',
  'workflow_execution_read_brand_dependencies',
  'workflow_execution_read_lineage',
  'workflow_execution_read_scopes',
  'notification_events',
  'notification_inbox_items',
  'subscription_attributions',
  'persona_availability_audits',
  'persona_grants',
];
