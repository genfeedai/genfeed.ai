export enum AgentThreadStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * Per-thread agent mode (#4672). Replaces the old `planModeEnabled` boolean:
 * `AUTO` never confirms credit-spending/brand-context/gated actions (outbound
 * still confirms), `MANUAL` confirms all four action classes, and `PLAN`
 * drafts a plan and runs its approved steps like `AUTO` (outbound still
 * confirms). One is saved per user as their default for new threads.
 */
export enum AgentThreadMode {
  AUTO = 'auto',
  MANUAL = 'manual',
  PLAN = 'plan',
}

/** New threads and never-configured users start in Manual. */
export const DEFAULT_AGENT_THREAD_MODE = AgentThreadMode.MANUAL;

export function normalizeAgentThreadMode(value: unknown): AgentThreadMode {
  if (typeof value !== 'string') {
    return DEFAULT_AGENT_THREAD_MODE;
  }
  const normalized = value.trim().toLowerCase();
  return (
    Object.values(AgentThreadMode).find((mode) => mode === normalized) ??
    DEFAULT_AGENT_THREAD_MODE
  );
}
