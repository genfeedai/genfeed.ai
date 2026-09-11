import type { CanonicalToolDefinition } from '../interfaces/tool-definition.interface';
import { ALL_TOOLS } from './tool-assembly';

/**
 * Fixed, kebab-case toolset names. `core` is always included regardless of
 * what a client selects; every other tool belongs to exactly one of the
 * remaining toolsets (see `CuratedActionCatalogEntry.toolset`).
 *
 * Keep this list and `TOOLSETS` sorted alphabetically so additions stay easy
 * to review.
 */
export const TOOLSET_NAMES = [
  'ads',
  'agent-chat',
  'analytics',
  'brand',
  'clips',
  'content',
  'core',
  'engagement',
  'generation',
  'goals',
  'inspiration',
  'knowledge',
  'memory',
  'onboarding',
  'outreach',
  'scheduler',
  'skills-pro',
  'social-inbox',
  'ui',
  'workflows',
] as const;

export type ToolsetName = (typeof TOOLSET_NAMES)[number];

export const CORE_TOOLSET_NAME: ToolsetName = 'core';

export interface ToolsetDefinition {
  name: ToolsetName;
  description: string;
  isAlwaysOn: boolean;
}

/**
 * Human-readable toolset catalog. `isAlwaysOn` is `true` only for `core`:
 * every MCP connection gets the discovery/account-basics tools whether or
 * not it asked for them, so a client can always discover what else exists.
 */
export const TOOLSETS: readonly ToolsetDefinition[] = [
  {
    description:
      'Meta, Google, and TikTok ad account, campaign, and insight tools.',
    isAlwaysOn: false,
    name: 'ads',
  },
  {
    description:
      'Chat with the account and coordinate work across agents: send messages, list and transfer conversations, and request assets from another agent.',
    isAlwaysOn: false,
    name: 'agent-chat',
  },
  {
    description:
      'Performance, content, video, and LinkedIn analytics plus trend discovery.',
    isAlwaysOn: false,
    name: 'analytics',
  },
  {
    description:
      'Brand identity, completeness, publishing readiness, and the brand interview flow.',
    isAlwaysOn: false,
    name: 'brand',
  },
  {
    description:
      'Clip project creation, analysis, and highlight extraction from source video.',
    isAlwaysOn: false,
    name: 'clips',
  },
  {
    description:
      'Posts, articles, the content calendar, repurposing, X post activity, and LinkedIn content generation.',
    isAlwaysOn: false,
    name: 'content',
  },
  {
    description:
      'Account basics and tool discovery. Always included on every connection regardless of the requested toolsets.',
    isAlwaysOn: true,
    name: 'core',
  },
  {
    description:
      'Proactive engagement discovery, reply drafting, livestream chat bots, and review-summary bookkeeping.',
    isAlwaysOn: false,
    name: 'engagement',
  },
  {
    description:
      'Image, video, music, voice, and avatar generation, plus listing generated media.',
    isAlwaysOn: false,
    name: 'generation',
  },
  {
    description: 'Create, track, and update measurable agent goals.',
    isAlwaysOn: false,
    name: 'goals',
  },
  {
    description:
      'Instagram and TikTok inspiration and top-performer discovery.',
    isAlwaysOn: false,
    name: 'inspiration',
  },
  {
    description: 'Capture, search, and manage brand knowledge sources.',
    isAlwaysOn: false,
    name: 'knowledge',
  },
  {
    description:
      'Save reusable content, preferences, and examples to agent memory.',
    isAlwaysOn: false,
    name: 'memory',
  },
  {
    description:
      'Brand setup, social account connection, and onboarding content generation.',
    isAlwaysOn: false,
    name: 'onboarding',
  },
  {
    description: 'Create, run, and analyze outreach sequences.',
    isAlwaysOn: false,
    name: 'outreach',
  },
  {
    description:
      'Scheduled release lifecycle and channel scheduling capability discovery.',
    isAlwaysOn: false,
    name: 'scheduler',
  },
  {
    description: 'Verify and install entitled Skills Pro packs.',
    isAlwaysOn: false,
    name: 'skills-pro',
  },
  {
    description:
      'Social conversation triage: replies, approvals, direct messages, and account activity.',
    isAlwaysOn: false,
    name: 'social-inbox',
  },
  {
    description:
      'In-product UI action cards for generation, workflow triggers, ingredients, and content review prompts.',
    isAlwaysOn: false,
    name: 'ui',
  },
  {
    description:
      'Workflow creation, execution, scheduling, and template management.',
    isAlwaysOn: false,
    name: 'workflows',
  },
];

const TOOLSET_NAME_SET: ReadonlySet<string> = new Set(TOOLSET_NAMES);

export function isToolsetName(value: string): value is ToolsetName {
  return TOOLSET_NAME_SET.has(value);
}

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
 */
export function parseToolsetSelection(
  raw: string | readonly string[] | undefined,
): ToolsetSelection {
  const segments = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  const toolsets: ToolsetName[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    if (seen.has(segment)) {
      continue;
    }
    seen.add(segment);

    if (isToolsetName(segment)) {
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
