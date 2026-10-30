import type { ToolsetName } from './toolset-names';

/**
 * Named MCP toolset profiles. A profile is a server-side selection of
 * existing toolsets — it does not move tools between toolsets, and it does
 * not add tools to `core` (that toolset is capped at 12 MCP tools).
 *
 * `default` is what the bare MCP URL loads: the make-then-post loop of
 * core, generation, content, and scheduler. Generation is the product, so it
 * is never left out to fit a cap; the cap tracks the default instead, and
 * shrinks as related tools merge into parameterized ones.
 * `studio` is the make-review-schedule-measure set for agent clients that
 * generate (Codex): the default plus brand and analytics. `?profile=full` and an
 * explicit `?toolsets=` reach everything else.
 */
export const MCP_PROFILE_NAMES = [
  'default',
  'directory',
  'studio',
  'full',
] as const;

export type McpToolsetProfileName = (typeof MCP_PROFILE_NAMES)[number];

/** Profile applied when the request has neither `?toolsets=` nor `?profile=`. */
export const BARE_URL_MCP_PROFILE: McpToolsetProfileName = 'default';

/**
 * Hard cap on tools the bare MCP URL lists to an ordinary (`user` role)
 * caller. Includes native campaign context and publishing readiness so a
 * caller can associate content and select a healthy brand channel before
 * scheduling. CI fails when a change pushes the default over it.
 */
export const BARE_MCP_URL_TOOL_CAP = 25;

/** Hard cap on tools any directory-safe or Claude connector listing may carry. */
export const CONNECTOR_MCP_TOOL_CAP = 30;

/**
 * Ceiling for `?profile=studio`, listed to a `user` caller. Studio is an
 * explicit opt-in for agent clients that generate, so it may exceed the
 * connector cap, but not grow without a decision.
 */
export const STUDIO_MCP_PROFILE_TOOL_CAP = 40;

export const DEFAULT_MCP_PROFILE_TOOLSETS: readonly ToolsetName[] = [
  'core',
  'generation',
  'content',
  'scheduler',
];

export const STUDIO_MCP_PROFILE_TOOLSETS: readonly ToolsetName[] = [
  ...DEFAULT_MCP_PROFILE_TOOLSETS,
  'brand',
  'analytics',
];

/**
 * Toolsets the directory profile never exposes. `generation` and `clipper`
 * are the image/video/audio tools directory review rejects
 * (https://claude.com/docs/connectors/building/review-criteria). `ui` is the
 * in-product widget and ticket card toolset (no MCP tools today); excluding
 * it keeps a later MCP widget off the directory URL.
 */
export const DIRECTORY_EXCLUDED_TOOLSETS: readonly ToolsetName[] = [
  'clipper',
  'generation',
  'ui',
];

const DIRECTORY_EXCLUDED_TOOLSET_SET: ReadonlySet<ToolsetName> = new Set(
  DIRECTORY_EXCLUDED_TOOLSETS,
);

export const DIRECTORY_MCP_PROFILE_TOOLSETS: readonly ToolsetName[] =
  DEFAULT_MCP_PROFILE_TOOLSETS.filter(
    (name) => !DIRECTORY_EXCLUDED_TOOLSET_SET.has(name),
  );

const MCP_PROFILE_NAME_SET: ReadonlySet<string> = new Set(MCP_PROFILE_NAMES);

export function isMcpToolsetProfileName(
  value: string,
): value is McpToolsetProfileName {
  return MCP_PROFILE_NAME_SET.has(value);
}

export type McpProfileResolution =
  | { kind: 'all' }
  | { kind: 'toolsets'; toolsets: readonly ToolsetName[] };

/**
 * `full` is the unfiltered catalog (`kind: 'all'`). Every other profile is
 * an explicit toolset list, so a name that is empty on this deploy stays in
 * the list and contributes nothing instead of widening back to every tool.
 */
export function resolveMcpProfile(
  profile: McpToolsetProfileName,
): McpProfileResolution {
  switch (profile) {
    case 'full':
      return { kind: 'all' };
    case 'directory':
      return { kind: 'toolsets', toolsets: DIRECTORY_MCP_PROFILE_TOOLSETS };
    case 'studio':
      return { kind: 'toolsets', toolsets: STUDIO_MCP_PROFILE_TOOLSETS };
    case 'default':
      return { kind: 'toolsets', toolsets: DEFAULT_MCP_PROFILE_TOOLSETS };
  }
}
