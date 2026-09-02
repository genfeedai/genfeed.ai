export enum AgentRunFrequency {
  EVERY_6_HOURS = 'every_6_hours',
  TWICE_DAILY = 'twice_daily',
  DAILY = 'daily',
}

/**
 * Strategy run-history lifecycle. Domain-only vocabulary persisted inside the
 * `agent_strategies.config.runHistory` JSON blob — no Prisma enum backs it.
 *
 * The first five members mirror `WorkflowExecutionStatus` so a history entry
 * can be written straight from a workflow execution. `BUDGET_EXHAUSTED` is the
 * strategy-orchestration extra: the run stopped because the strategy hit its
 * credit ceiling, not because the execution itself failed.
 *
 * @see WorkflowExecutionStatus (the execution-plane subset, Prisma-backed)
 */
export enum AgentStrategyRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  /** Strategy credit ceiling reached — distinct from an execution FAILED. */
  BUDGET_EXHAUSTED = 'BUDGET_EXHAUSTED',
}

export enum AgentType {
  GENERAL = 'general',
  X_CONTENT = 'x_content',
  IMAGE_CREATOR = 'image_creator',
  VIDEO_CREATOR = 'video_creator',
  AI_AVATAR = 'ai_avatar',
  ARTICLE_WRITER = 'article_writer',
  LINKEDIN_CONTENT = 'linkedin_content',
  ADS_SCRIPT_WRITER = 'ads_script_writer',
  SHORT_FORM_WRITER = 'short_form_writer',
  CTA_CONTENT = 'cta_content',
  YOUTUBE_SCRIPT = 'youtube_script',
  BRAND_INTERVIEW = 'brand_interview',
}

/**
 * Agent autonomy mode. Domain-only vocabulary — no Prisma column stores it.
 * The matching orphan Postgres type was dropped in
 * `20260807160000_drop_orphan_enums`; values stay SCREAMING so a future column
 * can adopt them without a cast.
 */
export enum AgentAutonomyMode {
  SUPERVISED = 'SUPERVISED',
  AUTO_PUBLISH = 'AUTO_PUBLISH',
}

/**
 * Resolves an autonomy mode from persisted settings JSON. The values were
 * lower-cased before the SCREAMING migration and organization settings are an
 * unmigrated JSON blob, so a case-sensitive match would silently downgrade a
 * stored `auto_publish` to SUPERVISED. Unknown values fall back to SUPERVISED.
 */
export function normalizeAgentAutonomyMode(value: unknown): AgentAutonomyMode {
  if (typeof value !== 'string') {
    return AgentAutonomyMode.SUPERVISED;
  }

  const normalized = value.trim().toUpperCase();

  return (
    Object.values(AgentAutonomyMode).find((mode) => mode === normalized) ??
    AgentAutonomyMode.SUPERVISED
  );
}
