export enum AgentRunFrequency {
  EVERY_6_HOURS = 'every_6_hours',
  TWICE_DAILY = 'twice_daily',
  DAILY = 'daily',
}

/**
 * Agent run lifecycle. Values match Prisma `AgentRunStatus` (SCREAMING_SNAKE)
 * so DB writes need no cast.
 *
 * `BUDGET_EXHAUSTED` is domain-only (strategy history / orchestration) — not a
 * Postgres AgentRunStatus label. Map it to FAILED before writing the agent_runs
 * column (see task-orchestrator normalizeRunStatus).
 *
 * @see packages/prisma/prisma/schema.prisma `enum AgentRunStatus`
 * @see AgentExecutionStatus (identical Prisma set without BUDGET_EXHAUSTED)
 */
export enum AgentRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  /** Strategy / orchestration only — not a Prisma AgentRun column value. */
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
 * Agent autonomy mode. Values match Prisma `AgentAutonomyMode`.
 * @see packages/prisma/prisma/schema.prisma `enum AgentAutonomyMode`
 */
export enum AgentAutonomyMode {
  SUPERVISED = 'SUPERVISED',
  AUTO_PUBLISH = 'AUTO_PUBLISH',
}
