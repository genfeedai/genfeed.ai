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
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_STARTED: 'checkout_started',
  CONNECT_GENFEED_STEP: 'connect_genfeed_step',
  CONTENT_WRITE_BLANK_DRAFT_STARTED: 'content_write_blank_draft_started',
  CONTENT_WRITE_OPENED: 'content_write_opened',
  CONTENT_WRITE_PROMPT_GENERATED: 'content_write_prompt_generated',
  CONVERSATION_SHELL_APPROVAL: 'conversation_shell_approval',
  CONVERSATION_SHELL_ERROR: 'conversation_shell_error',
  CONVERSATION_SHELL_OVERLAY_ABANDONMENT:
    'conversation_shell_overlay_abandonment',
  CONVERSATION_SHELL_PERFORMANCE: 'conversation_shell_performance',
  CONVERSATION_SHELL_RESTORATION_FAILURE:
    'conversation_shell_restoration_failure',
  CONVERSATION_SHELL_SCOPE_CORRECTION: 'conversation_shell_scope_correction',
  CONVERSATION_SHELL_SESSION: 'conversation_shell_session',
  CONVERSATION_SHELL_TRANSITION: 'conversation_shell_transition',
  FIRST_CREDIT_PURCHASED: 'first_credit_purchase',
  FIRST_SUCCESSFUL_PUBLISH: 'first_successful_publish',
  GENERATION_COMPLETED: 'generation_completed',
  GENERATION_STARTED: 'generation_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  POST_PUBLISHED: 'post_published',
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNUP_STARTED: 'signup_started',
  STUDIO_EDITOR_OPENED: 'studio_editor_opened',
  WORKFLOW_RUN_COMPLETED: 'workflow_run_completed',
  WORKFLOW_RUN_STARTED: 'workflow_run_started',
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Terminal outcome of a tracked action. */
export type AnalyticsOutcome = 'failure' | 'success';

export type ConnectGenfeedStep =
  | 'client_selected'
  | 'configuration_copied'
  | 'flow_started'
  | 'key_created'
  | 'key_selected'
  | 'publishing_handoff'
  | 'verification';

/** The public signup method the user selected. */
export type SignupMethod = 'google' | 'magic_link';

/** The checkout branch created from the onboarding handoff. */
export type CheckoutKind = 'credits' | 'managed_credits' | 'plan';

/** Bounded source marker for the funnel handoff being tracked. */
export type FunnelHandoffSource = 'post_signup' | 'stripe_return';

/** Content surface counted as activation after a successful publish. */
export type ActivationSurface = 'newsletter';

/**
 * Which generation path produced a compose-surface draft. Desktop paths run
 * over the local IPC bridge; the cloud path (no source) generates server-side.
 */
export type PromptGeneratedSource = 'desktop-ipc' | 'desktop-ipc-fallback';

/** Which studio editor surface was opened — the project index or the canvas. */
export type StudioEditorSurface = 'canvas' | 'index';

export type ConversationShellState = 'canvas' | 'conversation' | 'overlay';

export type ConversationShellTransition =
  | 'browser'
  | 'canvas_change'
  | 'canvas_launch'
  | 'conversation_return'
  | 'initial_restore'
  | 'overlay_dismiss'
  | 'overlay_open';

export type ConversationShellRestorationFailureReason =
  | 'invalid_overlay'
  | 'invalid_overlay_reference'
  | 'invalid_thread'
  | 'stale_overlay_reference'
  | 'unauthorized_overlay_reference';

export type ConversationShellDeploymentMode =
  | 'community'
  | 'desktop_cloud'
  | 'desktop_self_hosted'
  | 'saas'
  | 'unknown';

export interface ConversationShellTelemetryContext {
  readonly deploymentMode: ConversationShellDeploymentMode;
}

/**
 * Property shape for each event. Keys map 1:1 to {@link ANALYTICS_EVENTS} values.
 * Every property is a bounded identifier — never free-text.
 */
export interface AnalyticsEventProperties {
  [ANALYTICS_EVENTS.AGENT_THREAD_CREATED]: {
    /** Optional agent-type slug (e.g. the configured agent kind), never a title. */
    readonly agentType?: string;
  };
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_TRANSITION]: {
    readonly fromState: ConversationShellState;
    readonly toState: ConversationShellState;
    readonly transition: ConversationShellTransition;
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_SESSION]: ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_RESTORATION_FAILURE]: {
    readonly reason: ConversationShellRestorationFailureReason;
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_SCOPE_CORRECTION]: {
    readonly outcome: AnalyticsOutcome;
    readonly source: 'surface_adapter';
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_OVERLAY_ABANDONMENT]: {
    readonly overlayClass:
      | 'library_picker'
      | 'notifications'
      | 'shell_preview'
      | 'workflow_picker';
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_APPROVAL]: {
    readonly action: 'approve' | 'execute' | 'reject' | 'revoke';
    readonly integrity: 'blocked' | 'matched' | 'not_applicable';
    readonly outcome: AnalyticsOutcome;
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_PERFORMANCE]: {
    readonly deviceClass: 'desktop' | 'mobile';
    readonly durationMs: number;
    readonly metric: 'first_useful_paint';
    readonly routeClass: 'agent' | 'management' | 'product';
    readonly shellMode: 'conversation';
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.CONVERSATION_SHELL_ERROR]: {
    readonly code:
      | 'render_failed'
      | 'request_failed'
      | 'restoration_failed'
      | 'scope_sync_failed';
    readonly stage: 'render' | 'restoration' | 'scope';
  } & ConversationShellTelemetryContext;
  [ANALYTICS_EVENTS.SIGNUP_STARTED]: {
    readonly hasCloudHandoff: boolean;
    readonly hasCreditsIntent: boolean;
    readonly hasPlanIntent: boolean;
    readonly method: SignupMethod;
  };
  [ANALYTICS_EVENTS.SIGNUP_COMPLETED]: {
    readonly handoffSource: Extract<FunnelHandoffSource, 'post_signup'>;
    readonly hasCloudHandoff: boolean;
    readonly hasCreditsIntent: boolean;
    readonly hasPlanIntent: boolean;
  };
  [ANALYTICS_EVENTS.CHECKOUT_STARTED]: {
    readonly checkoutKind: CheckoutKind;
    readonly handoffSource: Extract<FunnelHandoffSource, 'post_signup'>;
  };
  [ANALYTICS_EVENTS.CHECKOUT_COMPLETED]: {
    readonly checkoutKind: CheckoutKind;
    readonly handoffSource: Extract<FunnelHandoffSource, 'stripe_return'>;
  };
  [ANALYTICS_EVENTS.CONNECT_GENFEED_STEP]: {
    readonly client: 'claude-code' | 'codex' | 'generic';
    readonly deployment: 'cloud' | 'self-hosted';
    readonly outcome?: AnalyticsOutcome;
    readonly step: ConnectGenfeedStep;
  };
  [ANALYTICS_EVENTS.FIRST_CREDIT_PURCHASED]: {
    readonly checkoutKind: Extract<CheckoutKind, 'credits' | 'managed_credits'>;
    readonly handoffSource: Extract<FunnelHandoffSource, 'stripe_return'>;
  };
  [ANALYTICS_EVENTS.ONBOARDING_COMPLETED]: Record<string, never>;
  [ANALYTICS_EVENTS.CONTENT_WRITE_OPENED]: Record<string, never>;
  [ANALYTICS_EVENTS.CONTENT_WRITE_BLANK_DRAFT_STARTED]: {
    /** Whether the draft was seeded from a preselected ingredient. */
    readonly hasPrefilledIngredient: boolean;
    /** Connected-platform slug (e.g. "x", "linkedin"), never post content. */
    readonly platform: string;
  };
  [ANALYTICS_EVENTS.CONTENT_WRITE_PROMPT_GENERATED]: {
    /** Connected- or desktop-platform slug, never the prompt/generated text. */
    readonly platform: string;
    /** Which generation path ran; absent for the default cloud path. */
    readonly source?: PromptGeneratedSource;
  };
  [ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED]: {
    readonly surface: StudioEditorSurface;
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
  [ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH]: {
    /** Connected-platform slug (e.g. "x", "linkedin"), never post content. */
    readonly platform: string;
    readonly surface: ActivationSurface;
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
