/**
 * Agent runtimes that execute outside Genfeed on the user's own machine and
 * subscription (Claude Code / Codex CLI driven by Genfeed Desktop). Threads,
 * brand context, and memory stay in Genfeed; the model turn is paid by the
 * user's CLI subscription, so these turns never reserve Genfeed credits.
 */
export const AGENT_EXTERNAL_RUNTIME_KEYS = {
  CLAUDE_CLI: 'local/claude-cli',
  CODEX_CLI: 'local/codex-cli',
} as const;

export type AgentExternalRuntimeKey =
  (typeof AGENT_EXTERNAL_RUNTIME_KEYS)[keyof typeof AGENT_EXTERNAL_RUNTIME_KEYS];

export const AGENT_EXTERNAL_RUNTIME_KEY_VALUES: readonly AgentExternalRuntimeKey[] =
  Object.values(AGENT_EXTERNAL_RUNTIME_KEYS);

/** `AgentThread.source` for threads created by an external CLI runtime. */
export const AGENT_EXTERNAL_RUNTIME_THREAD_SOURCE = 'desktop-cli';

/** Opaque CLI session identifiers (Claude UUIDs, Codex thread ids). */
export const AGENT_EXTERNAL_RUNTIME_SESSION_ID_PATTERN =
  /^[A-Za-z0-9._:-]{1,128}$/;

export function isAgentExternalRuntimeKey(
  value: unknown,
): value is AgentExternalRuntimeKey {
  return (
    typeof value === 'string' &&
    (AGENT_EXTERNAL_RUNTIME_KEY_VALUES as readonly string[]).includes(value)
  );
}
