/**
 * The most tools a connection lists to an ordinary caller. Merge related
 * actions into one `{action, input}` tool instead of raising it. A code
 * constant on purpose: no server reads a cap from its environment.
 */
export const MCP_TOOL_CAP = 30;

/** Throws when a listing is over the cap, naming the count and the cap. */
export function assertMcpToolCap(
  listedCount: number,
  cap: number = MCP_TOOL_CAP,
): void {
  if (listedCount > cap) {
    throw new Error(
      `MCP catalog exceeds the ${cap}-tool cap: lists ${listedCount}`,
    );
  }
}
