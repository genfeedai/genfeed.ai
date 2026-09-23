import type { ToolsetName } from './toolset-names';

/**
 * Named MCP toolset profiles. A profile is a server-side selection of
 * existing toolsets — it does not move tools between toolsets, and it does
 * not add tools to `core` (that toolset is capped at 12 MCP tools).
 *
 * `default` is what the bare MCP URL loads. The intended set is core,
 * scheduler, content, generation, analytics, brand, and onboarding, but
 * those seven are 55 MCP tools and the bare URL is capped at
 * {@link BARE_MCP_URL_TOOL_CAP}. core + scheduler + content is 28, and
 * adding any of the remaining four (generation 12, analytics 7, brand 5,
 * onboarding 3) crosses the cap, so they stay off `default`. `?profile=full`
 * and an explicit `?toolsets=` still reach them.
 */
export const MCP_PROFILE_NAMES = ['default', 'directory', 'full'] as const;

export type McpToolsetProfileName = (typeof MCP_PROFILE_NAMES)[number];

/** Profile applied when the request has neither `?toolsets=` nor `?profile=`. */
export const BARE_URL_MCP_PROFILE: McpToolsetProfileName = 'default';

/** Hard cap on tools advertised by the bare MCP URL (`tools/list`). */
export const BARE_MCP_URL_TOOL_CAP = 30;

export const DEFAULT_MCP_PROFILE_TOOLSETS: readonly ToolsetName[] = [
  'core',
  'scheduler',
  'content',
];

/**
 * Toolsets the directory profile never exposes. `generation` and `clips`
 * are the image/video/audio tools directory review rejects. `ui` is the
 * in-product widget and ticket card toolset (no MCP tools today); excluding
 * it keeps a later MCP widget off the directory URL.
 */
export const DIRECTORY_EXCLUDED_TOOLSETS: readonly ToolsetName[] = [
  'clips',
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
    case 'default':
      return { kind: 'toolsets', toolsets: DEFAULT_MCP_PROFILE_TOOLSETS };
  }
}
