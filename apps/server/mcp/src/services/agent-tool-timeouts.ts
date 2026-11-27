/**
 * How long the MCP server waits on the API for an agent tool that waits on a
 * model. Every other call keeps the API client's 30 s default.
 *
 * Text generation runs p50 19 s and p95 27 s in production, so the default
 * leaves it almost no margin and a slow one failed for the caller although
 * nothing was broken (#11450). The budget stays under the 60 s the load balancer
 * lets a connection sit without a byte: a longer wait would be cut by the
 * balancer before it could answer. A generation that needs more than a minute
 * has to become a job the caller polls, not a longer wait.
 */
export const GENERATION_TOOL_TIMEOUT_MS = 55_000;

/** Agent tool name to its own budget, for the tools that wait on a model. */
const AGENT_TOOL_TIMEOUT_MS: Readonly<Record<string, number>> = {
  generate: GENERATION_TOOL_TIMEOUT_MS,
  generate_content: GENERATION_TOOL_TIMEOUT_MS,
};

/** The budget for `name`, or `undefined` to use the client default. */
export function agentToolTimeoutMs(name: string): number | undefined {
  return Object.hasOwn(AGENT_TOOL_TIMEOUT_MS, name)
    ? AGENT_TOOL_TIMEOUT_MS[name]
    : undefined;
}
