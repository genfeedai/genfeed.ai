import {
  getToolsets,
  MCP_CREDIT_COST_META_KEY,
  MCP_MUTATION_POLICY_META_KEY,
  MCP_TOOLSET_META_KEY,
  type McpToolOutput,
} from '@genfeedai/actions';

/** MCP-surfaced meta tools handled entirely in-process — no API call. */
export const TOOL_DISCOVERY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'list_toolsets',
  'search_tools',
  'describe_tool',
]);

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const CLOSEST_MATCH_LIMIT = 5;

/**
 * Whatever exposes the role-filtered full catalog to the discovery handlers.
 * `search_tools`/`describe_tool` must be able to find a tool outside the
 * caller's currently-loaded toolset selection — the whole point is helping a
 * client discover what else exists so it can reconnect with a different
 * `?toolsets=`. Declared standalone (not importing `ToolRegistryService`) so
 * this module has no dependency back on the registry.
 */
export interface ToolDiscoverySource {
  getDiscoverableTools(): McpToolOutput[];
}

interface ToolDiscoveryEntry {
  name: string;
  toolset: string;
  description: string;
  mutationPolicy: string;
  creditCost: number;
  requiredRole: McpToolOutput['requiredRole'];
}

function toDiscoveryEntry(tool: McpToolOutput): ToolDiscoveryEntry {
  return {
    creditCost: Number(tool._meta[MCP_CREDIT_COST_META_KEY] ?? 0),
    description: tool.description,
    mutationPolicy: String(
      tool._meta[MCP_MUTATION_POLICY_META_KEY] ?? 'direct',
    ),
    name: tool.name,
    requiredRole: tool.requiredRole,
    toolset: String(tool._meta[MCP_TOOLSET_META_KEY] ?? ''),
  };
}

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ text, type: 'text' as const }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function errorResult(text: string) {
  return { content: [{ text, type: 'text' as const }], isError: true };
}

function handleListToolsets() {
  const toolsets = getToolsets('mcp');
  const lines = toolsets.map(
    (toolset) =>
      `- ${toolset.name}${toolset.isAlwaysOn ? ' (always on)' : ''}: ${toolset.toolCount} tool(s) — ${toolset.description}`,
  );

  return textResult(`Available toolsets:\n\n${lines.join('\n')}`, {
    toolsets,
  });
}

function handleSearchTools(
  registry: ToolDiscoverySource,
  args: Record<string, unknown>,
) {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const toolsetFilter =
    typeof args.toolset === 'string' ? args.toolset.trim() : '';

  if (!query && !toolsetFilter) {
    return errorResult(
      'search_tools requires at least one of "query" or "toolset".',
    );
  }

  const rawLimit =
    typeof args.limit === 'number' ? args.limit : DEFAULT_SEARCH_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_SEARCH_LIMIT);
  const needle = query.toLowerCase();

  const matches = registry
    .getDiscoverableTools()
    .map(toDiscoveryEntry)
    .filter((entry) => {
      if (toolsetFilter && entry.toolset !== toolsetFilter) return false;
      if (!needle) return true;
      return (
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle) ||
        entry.toolset.toLowerCase().includes(needle)
      );
    })
    .slice(0, limit);

  return textResult(
    matches.length > 0
      ? `Found ${matches.length} tool(s):\n\n${matches
          .map(
            (match) =>
              `- ${match.name} (${match.toolset}): ${match.description}`,
          )
          .join('\n')}`
      : 'No matching tools found.',
    { tools: matches },
  );
}

function handleDescribeTool(
  registry: ToolDiscoverySource,
  args: Record<string, unknown>,
) {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) {
    return errorResult('describe_tool requires "name".');
  }

  const tools = registry.getDiscoverableTools();
  const tool = tools.find((candidate) => candidate.name === name);

  if (!tool) {
    const closest = closestMatches(name, tools);
    return errorResult(
      closest.length > 0
        ? `Unknown tool "${name}". Closest matches: ${closest.join(', ')}.`
        : `Unknown tool "${name}". No similar tool names were found.`,
    );
  }

  return textResult(`${tool.name}:\n\n${JSON.stringify(tool, null, 2)}`, {
    tool,
  });
}

/** Plain Levenshtein edit distance — no dependency for a small, bounded input. */
function levenshteinDistance(a: string, b: string): number {
  const distances: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    let previousDiagonal = distances[0];
    distances[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previous = distances[j];
      distances[j] =
        a[i - 1] === b[j - 1]
          ? previousDiagonal
          : 1 + Math.min(previousDiagonal, distances[j], distances[j - 1]);
      previousDiagonal = previous;
    }
  }

  return distances[b.length];
}

function closestMatches(name: string, tools: McpToolOutput[]): string[] {
  const needle = name.toLowerCase();
  const maxDistance = Math.max(3, Math.ceil(needle.length / 2));

  return tools
    .map((tool) => ({
      distance: levenshteinDistance(needle, tool.name.toLowerCase()),
      name: tool.name,
    }))
    .filter((candidate) => candidate.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, CLOSEST_MATCH_LIMIT)
    .map((candidate) => candidate.name);
}

export function handleToolDiscoveryTool(
  registry: ToolDiscoverySource,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'list_toolsets':
      return handleListToolsets();
    case 'search_tools':
      return handleSearchTools(registry, args);
    case 'describe_tool':
      return handleDescribeTool(registry, args);
    default:
      throw new Error(`Unknown tool discovery tool: ${name}`);
  }
}
