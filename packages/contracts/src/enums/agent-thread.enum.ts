export enum AgentThreadStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * Per-thread agent mode (#4672). Replaces the old `planModeEnabled` boolean:
 * `AUTO` and `PLAN` retain all declared approval-required and outbound gates.
 * `MANUAL` additionally confirms credit spending and brand context changes.
 * `PLAN` drafts a plan and runs its approved steps with the same gates as `AUTO`.
 * One is saved per user as their default for new threads.
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
