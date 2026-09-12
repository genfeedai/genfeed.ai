/**
 * Fixed, kebab-case toolset names and their static definitions.
 *
 * This module is a true leaf: it imports nothing from the rest of the
 * package. `curated-action-catalog.ts`, `tool-definition.interface.ts`, and
 * `toolsets.ts` all depend on it, and `toolsets.ts` depends on
 * `tool-assembly.ts` (via `ALL_TOOLS`), which depends on
 * `curated-action-catalog.ts`. Keeping the name/definition data here — with
 * no imports back into that graph — avoids a circular import that madge
 * (and the `check:import-cycles` static analysis, which also counts
 * type-only imports) would otherwise flag between `toolsets.ts` and
 * `tool-assembly.ts`.
 */

/**
 * `core` is always included regardless of what a client selects; every
 * other tool belongs to exactly one of the remaining toolsets (see
 * `CuratedActionCatalogEntry.toolset`).
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
