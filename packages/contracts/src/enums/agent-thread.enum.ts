export enum AgentThreadStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/**
 * What a thread is for (#8526). `MASTER` is the one org-level thread per user
 * per organization that talks to the user and orchestrates the others through
 * agent transfers; every other thread is a plain `THREAD`. A partial unique
 * index on `agent_threads` enforces at most one live master per
 * (organization, user).
 */
export enum AgentThreadKind {
  MASTER = 'master',
  THREAD = 'thread',
}

/**
 * Who a thread share reaches (#9936). `MEMBER` names one member, `BRAND` every
 * member with access to that brand, `ORGANIZATION` every active member. Mirrors
 * the CHECK on `agent_thread_shares.scope`.
 */
export enum AgentThreadShareScope {
  BRAND = 'brand',
  MEMBER = 'member',
  ORGANIZATION = 'organization',
}

/**
 * What a share lets the viewer do: read the thread, or also prompt the agent in
 * it. Mirrors the CHECK on `agent_thread_shares.level`.
 */
export enum AgentThreadShareLevel {
  COLLABORATE = 'collaborate',
  VIEW = 'view',
}

/**
 * What the viewer may do with a thread: `OWNER` created it, the others come
 * from a live share. Returned with each thread so a client needs no second call.
 */
export enum AgentThreadAccessLevel {
  COLLABORATE = 'collaborate',
  OWNER = 'owner',
  VIEW = 'view',
}

/**
 * The thread list's owner filter (#9936, #8574): everything the viewer can open,
 * only their own threads, or only the ones shared with them.
 */
export enum AgentThreadOwnerFilter {
  ALL = 'all',
  MINE = 'mine',
  SHARED = 'shared',
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
