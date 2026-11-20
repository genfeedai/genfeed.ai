import {
  getMcpCatalogOperations,
  getRetiredMcpCatalogTool,
  MCP_CREDIT_COST_META_KEY,
  MCP_MUTATION_POLICY_META_KEY,
  type McpToolOutput,
} from '@genfeedai/actions';
import type {
  ToolDiscoveryEntry,
  ToolDiscoverySource,
} from '@mcp/shared/interfaces/tool-discovery.interface';
import { readableLabel } from '@mcp/shared/utils/tool-result-text.util';

/** MCP-surfaced meta tools handled entirely in-process — no API call. */
export const TOOL_DISCOVERY_TOOL_NAMES: ReadonlySet<string> = new Set([
  'find_tools',
]);

const SENTENCE_END_PATTERN = /[.!?](\s|$)/;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 50;
const CLOSEST_MATCH_LIMIT = 5;

function toDiscoveryEntry(tool: McpToolOutput): ToolDiscoveryEntry {
  return {
    actions: getMcpCatalogOperations(tool.name).map(
      (operation) => operation.action,
    ),
    creditCost: Number(tool._meta[MCP_CREDIT_COST_META_KEY] ?? 0),
    description: tool.description,
    mutationPolicy: String(
      tool._meta[MCP_MUTATION_POLICY_META_KEY] ?? 'direct',
    ),
    name: tool.name,
    requiredRole: tool.requiredRole,
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

function firstSentence(text: string): string {
  const end = text.search(SENTENCE_END_PATTERN);
  return end === -1 ? text : text.slice(0, end + 1);
}

function describeEntry(entry: ToolDiscoveryEntry): string {
  const actions =
    entry.actions.length > 0 ? ` [actions: ${entry.actions.join(', ')}]` : '';
  return `- ${entry.name}${actions}: ${firstSentence(entry.description)}`;
}

/**
 * `find_tools` with no query lists every tool this connection serves; with a
 * query it matches a tool name, its description, or the name of an action it
 * runs, including the name of a retired tool.
 */
function handleSearchTools(
  registry: ToolDiscoverySource,
  args: Record<string, unknown>,
) {
  const needle =
    typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const rawLimit =
    typeof args.limit === 'number' ? args.limit : DEFAULT_SEARCH_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_SEARCH_LIMIT);
  const retired = getRetiredMcpCatalogTool(needle);

  const entries = registry.getTools().map(toDiscoveryEntry);
  const matches = (
    needle
      ? entries.filter(
          (entry) =>
            entry.name === retired?.canonicalName ||
            entry.name.toLowerCase().includes(needle) ||
            entry.description.toLowerCase().includes(needle) ||
            entry.actions.some((action) =>
              action.toLowerCase().includes(needle),
            ),
        )
      : entries
  ).slice(0, needle ? limit : entries.length);

  return textResult(
    matches.length > 0
      ? `${needle ? `Found ${matches.length} tool(s)` : `${matches.length} tool(s)`}:\n\n${matches.map(describeEntry).join('\n')}`
      : 'No matching tools found.',
    { tools: matches },
  );
}

function handleDescribeTool(
  registry: ToolDiscoverySource,
  args: Record<string, unknown>,
) {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const tools = registry.getTools();
  const retired = getRetiredMcpCatalogTool(name);
  const tool = tools.find(
    (candidate) => candidate.name === (retired?.canonicalName ?? name),
  );

  if (!tool) {
    const closest = closestMatches(name, tools);
    return errorResult(
      closest.length > 0
        ? `Unknown tool "${name}". Closest matches: ${closest.join(', ')}.`
        : `Unknown tool "${name}". No similar tool names were found.`,
    );
  }

  const properties = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const parameters = Object.entries(properties).map(([key, value]) => {
    const description =
      value !== null && typeof value === 'object' && 'description' in value
        ? value.description
        : undefined;
    return `- ${key}${required.has(key) ? ' (required)' : ' (optional)'}${typeof description === 'string' ? `: ${description}` : ''}`;
  });
  return textResult(
    `${tool.title || readableLabel(tool.name)}\n\n${retired ? `Use ${retired.canonicalName}(action=${retired.action}).\n\n` : ''}${tool.description}\n\nParameters:\n${parameters.length ? parameters.join('\n') : 'None.'}`,
    {
      tool,
    },
  );
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

/**
 * `find_tools`: `name` describes one tool, `query` searches, and no argument
 * lists every tool.
 */
export function handleToolDiscoveryTool(
  registry: ToolDiscoverySource,
  name: string,
  args: Record<string, unknown>,
) {
  if (name !== 'find_tools') {
    throw new Error(`Unknown tool discovery tool: ${name}`);
  }
  if (typeof args.name === 'string' && args.name.trim()) {
    return handleDescribeTool(registry, args);
  }
  return handleSearchTools(registry, args);
}
