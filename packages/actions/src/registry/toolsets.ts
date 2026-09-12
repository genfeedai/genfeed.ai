import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { ALL_TOOLS } from './tool-assembly';
import type { ToolsetDefinition, ToolsetName } from './toolset-names';
import { CORE_TOOLSET_NAME, isToolsetName, TOOLSETS } from './toolset-names';

export type { ToolsetDefinition, ToolsetName } from './toolset-names';
export {
  CORE_TOOLSET_NAME,
  isToolsetName,
  TOOLSET_NAMES,
  TOOLSETS,
} from './toolset-names';

export interface ToolsetSummary extends ToolsetDefinition {
  toolCount: number;
  toolNames: string[];
}

/**
 * Toolsets that have at least one tool on the given surface, each with its
 * tool count and names on that surface. A toolset with zero tools on a
 * surface (e.g. an agent-only toolset queried for `'mcp'`) is omitted.
 */
export function getToolsets(surface: 'agent' | 'mcp'): ToolsetSummary[] {
  const toolsOnSurface = ALL_TOOLS.filter((tool) => tool.surfaces[surface]);
  const summaries: ToolsetSummary[] = [];

  for (const definition of TOOLSETS) {
    const toolNames = toolsOnSurface
      .filter((tool) => tool.toolset === definition.name)
      .map((tool) => tool.name)
      .sort((a, b) => a.localeCompare(b));

    if (toolNames.length === 0) {
      continue;
    }

    summaries.push({
      ...definition,
      toolCount: toolNames.length,
      toolNames,
    });
  }

  return summaries;
}

/**
 * Names of the toolsets that have at least one tool on the given surface,
 * in the same order as `getToolsets`. Convenience for callers (e.g. the MCP
 * middleware's error message) that only need the names, not the full
 * summaries.
 */
export function getToolsetNames(surface: 'agent' | 'mcp'): ToolsetName[] {
  return getToolsets(surface).map((toolset) => toolset.name);
}

/**
 * Lazily-filled per-surface cache of `getToolsetNames`. `ALL_TOOLS` is a
 * static module-level constant, so the name set for a surface never changes
 * within a process — computing it once avoids re-filtering and re-sorting
 * the whole catalog on every `parseToolsetSelection` call, including the
 * unauthenticated `tools/list` requests that carry no `?toolsets=` at all.
 */
const toolsetNamesBySurface = new Map<
  'agent' | 'mcp',
  ReadonlySet<ToolsetName>
>();

function getToolsetNameSet(surface: 'agent' | 'mcp'): ReadonlySet<ToolsetName> {
  const cached = toolsetNamesBySurface.get(surface);
  if (cached) {
    return cached;
  }

  const names = new Set<ToolsetName>(getToolsetNames(surface));
  toolsetNamesBySurface.set(surface, names);
  return names;
}

export interface ToolsetSelection {
  toolsets: ToolsetName[];
  unknown: string[];
}

/**
 * Parses a `?toolsets=` query value into known and unknown toolset names.
 * Accepts a single comma-separated string or an array of such strings
 * (Express repeats a query param into an array when it appears more than
 * once). Trims whitespace, lowercases, drops empty segments, and dedupes.
 * `undefined` or an all-empty value means "no selection" — the caller
 * should treat that as "every toolset".
 *
 * When `surface` is omitted, a segment is "known" if it is any declared
 * toolset name (`isToolsetName`), regardless of whether that toolset has
 * tools on a particular surface. When `surface` is given, a segment is only
 * "known" if the toolset also has at least one tool on that surface — an
 * agent-only toolset name (e.g. `onboarding`) passed for the `mcp` surface
 * goes into `unknown` instead of silently resolving to core-only.
 */
export function parseToolsetSelection(
  raw: string | readonly string[] | undefined,
  surface?: 'agent' | 'mcp',
): ToolsetSelection {
  const segments = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  if (segments.length === 0) {
    return { toolsets: [], unknown: [] };
  }

  const namesOnSurface = surface ? getToolsetNameSet(surface) : undefined;

  const toolsets: ToolsetName[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (seen.has(segment)) {
      continue;
    }
    seen.add(segment);

    if (
      isToolsetName(segment) &&
      (!namesOnSurface || namesOnSurface.has(segment))
    ) {
      toolsets.push(segment);
    } else {
      unknown.push(segment);
    }
  }

  return { toolsets, unknown };
}

/**
 * Tools available on a surface for a requested toolset selection. An empty
 * selection means "every toolset" (the default, unfiltered connection).
 * Otherwise the result is the selected toolsets unioned with `core` (always
 * on), sorted by name with no duplicates.
 */
export function getToolsForToolsets(
  surface: 'agent' | 'mcp',
  toolsets: readonly ToolsetName[],
): CanonicalToolDefinition[] {
  const toolsOnSurface = ALL_TOOLS.filter((tool) => tool.surfaces[surface]);

  if (toolsets.length === 0) {
    return [...toolsOnSurface].sort((a, b) => a.name.localeCompare(b.name));
  }

  const allowed = new Set<ToolsetName>([...toolsets, CORE_TOOLSET_NAME]);
  return toolsOnSurface
    .filter((tool) => allowed.has(tool.toolset))
    .sort((a, b) => a.name.localeCompare(b.name));
}
