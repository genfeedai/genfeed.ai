import type { GenerationType } from '@genfeedai/enums';

/**
 * PostHog product-analytics event taxonomy for the studio app.
 *
 * This is the single source of truth for every event Genfeed Cloud emits. Adding
 * a new event means adding a key here plus its property shape in
 * {@link AnalyticsEventProperties}; nothing else in the app may capture an event
 * name that is not declared in this file.
 *
 * Privacy contract: property values are restricted to enum-like identifiers,
 * outcomes, and platform/type slugs. No generated content, prompts, titles, or
 * other free-text user input is ever permitted as a property value (issue #1178,
 * FR8). The types below intentionally do not allow arbitrary string bags so the
 * type-checker enforces that contract at every call site.
 */
export const ANALYTICS_EVENTS = {
  AGENT_THREAD_CREATED: 'agent_thread_created',
  GENERATION_COMPLETED: 'generation_completed',
  GENERATION_STARTED: 'generation_started',
  POST_PUBLISHED: 'post_published',
  WORKFLOW_RUN_COMPLETED: 'workflow_run_completed',
  WORKFLOW_RUN_STARTED: 'workflow_run_started',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Terminal outcome of a tracked action. */
export type AnalyticsOutcome = 'failure' | 'success';

/**
 * Property shape for each event. Keys map 1:1 to {@link ANALYTICS_EVENTS} values.
 * Every property is a bounded identifier — never free-text.
 */
export interface AnalyticsEventProperties {
  [ANALYTICS_EVENTS.AGENT_THREAD_CREATED]: {
    /** Optional agent-type slug (e.g. the configured agent kind), never a title. */
    readonly agentType?: string;
  };
  [ANALYTICS_EVENTS.GENERATION_STARTED]: {
    readonly generationType: GenerationType;
  };
  [ANALYTICS_EVENTS.GENERATION_COMPLETED]: {
    readonly generationType: GenerationType;
    readonly outcome: AnalyticsOutcome;
  };
  [ANALYTICS_EVENTS.POST_PUBLISHED]: {
    /** Connected-platform slug (e.g. "x", "linkedin"), never post content. */
    readonly platform: string;
  };
  [ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED]: {
    /** Workflow-type slug where known, never a workflow name/description. */
    readonly workflowType?: string;
  };
  [ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED]: {
    readonly workflowType?: string;
    readonly outcome: AnalyticsOutcome;
  };
}
