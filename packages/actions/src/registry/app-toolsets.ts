import type {
  CoreAppId,
  NativeSecondaryAppId,
} from '@genfeedai/contracts/constants/native-apps.constant';
import type { ToolsetName } from './toolset-names';

/**
 * `?app=` on the MCP endpoint adds the toolsets behind a Genfeed app to
 * whatever the request already selects (the bare-URL default, `?profile=`, or
 * an explicit `?toolsets=`). One entry per core and native secondary app, so a
 * new app fails the type check until it is mapped here.
 *
 * An empty list means the app has no MCP tools yet; `?app=` accepts it and
 * adds nothing. `editor` shares `clipper` because the editor handoff
 * (`open_in_editor`, `edit_clip`) ships in that toolset.
 */
export const MCP_APP_TOOLSETS = {
  agent: ['agent-chat'],
  analytics: ['analytics'],
  automation: ['workflows'],
  clipper: ['clipper'],
  discovery: ['ads', 'inspiration'],
  editor: ['clipper'],
  library: ['generation'],
  messages: ['social-inbox'],
  motion: ['visual-code'],
  playground: ['generation'],
  publishing: ['articles', 'content', 'onboarding', 'scheduler'],
  storyboard: ['inspiration'],
  turbo: ['content'],
  workspace: [],
} as const satisfies Record<
  CoreAppId | NativeSecondaryAppId,
  readonly ToolsetName[]
>;

export type McpAppName = keyof typeof MCP_APP_TOOLSETS;

export const MCP_APP_NAMES = Object.keys(MCP_APP_TOOLSETS) as McpAppName[];

const MCP_APP_NAME_SET: ReadonlySet<string> = new Set(MCP_APP_NAMES);

export function isMcpAppName(value: string): value is McpAppName {
  return MCP_APP_NAME_SET.has(value);
}

/** Toolsets the named apps add, in app order, without duplicates. */
export function resolveMcpAppToolsets(
  apps: readonly McpAppName[],
): ToolsetName[] {
  return [...new Set(apps.flatMap((app) => MCP_APP_TOOLSETS[app]))];
}
