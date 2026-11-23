/** Runs one agent may start from events in any rolling day when the step sets no cap. */
export const AGENT_EVENT_RUN_DAILY_CAP_DEFAULT = 10;

/** The most a step may raise the cap to. */
export const AGENT_EVENT_RUN_DAILY_CAP_MAX = 100;

/** The window the cap counts over. A rolling day has no timezone to get wrong. */
export const AGENT_EVENT_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How long a claim that has not reached STARTED keeps its event to itself. The
 * claim covers one enqueue, so a worker that crashed inside it has long since
 * gone; after the lease another delivery may take the event over.
 */
export const AGENT_EVENT_RUN_CLAIM_LEASE_MS = 10 * 60 * 1000;

/** Event text longer than this is cut before it reaches the agent. */
export const AGENT_EVENT_TEXT_MAX_LENGTH = 4000;
