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
  /** camelCase delegate of the first-order parent whose brand we filter by. */
  readonly parentDelegate: string;
  /** Brand field on the parent (matches a FIRST_ORDER_TARGETS entry). */
  readonly parentBrandField: string;
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
 * `lastUsedBrandId`, a per-user UI pointer — the member row belongs to its own org
 * and must NOT move).
 *
 * Non-standard field names are hand-mapped: `Asset` (parentBrandId/parentOrgId),
 * `ContextBase` (sourceBrandId), `Lead` (proactiveBrandId → proactiveOrganizationId,
 * NOT its plain `organizationId`, which is the lead-gen org and stays put).
 */
export const FIRST_ORDER_TARGETS: readonly FirstOrderCascadeTarget[] = [
  {
    delegate: 'brandInterview',
    table: 'brand_interviews',
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
    delegate: 'postAnalytics',
    table: 'post_analytics',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'schedule',
    table: 'schedules',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'contentSchedule',
    table: 'content_schedules',
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
    delegate: 'agentRun',
    table: 'agent_runs',
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
    delegate: 'contentDraft',
    table: 'content_drafts',
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
    delegate: 'batch',
    table: 'batches',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
  {
    delegate: 'run',
    table: 'runs',
    brandField: 'brandId',
    orgField: 'organizationId',
  },
];

/**
 * Org-scoped children with no brand key of their own. Their org must follow a moved
 * first-order parent, joined by scalar FK (no relation-name guessing — FK fields are
 * verified against the schema by the staleness test).
 *
 * Intentionally NOT relocated here (org- or execution-level history, ambiguous
 * ownership): `SubscriptionAttribution` (revenue, keyed to the subscriber org),
 * `AgentThread` / `AgentThreadEvent` (agent conversation history — no brand key,
 * indirect ownership), `Invitation` (org-level). These stay in the source org by
 * design.
 *
 * `WorkflowExecution` / `BatchWorkflowJob` hang off the first-order `Workflow`
 * parent and now move with the brand-owned workflow row.
 */
export const SECOND_ORDER_TARGETS: readonly SecondOrderCascadeTarget[] = [
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
    delegate: 'batchWorkflowJob',
    table: 'batch_workflow_jobs',
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
    delegate: 'transcript',
    table: 'transcripts',
    orgField: 'organizationId',
    parents: [
      {
        parentDelegate: 'article',
        parentBrandField: 'brandId',
        fkField: 'articleId',
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
export const KNOWN_EXCLUDED_MODELS: readonly string[] = ['Member'];

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
export const AUDITOR_IGNORED_TABLES: readonly string[] = ['members'];
