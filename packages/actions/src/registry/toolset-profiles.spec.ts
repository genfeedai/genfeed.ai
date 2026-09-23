import { describe, expect, it } from 'vitest';
import type { ToolsetName } from './toolset-names';
import {
  BARE_MCP_URL_TOOL_CAP,
  BARE_URL_MCP_PROFILE,
  DEFAULT_MCP_PROFILE_TOOLSETS,
  DIRECTORY_EXCLUDED_TOOLSETS,
  DIRECTORY_MCP_PROFILE_TOOLSETS,
  isMcpToolsetProfileName,
  MCP_PROFILE_NAMES,
  resolveMcpProfile,
} from './toolset-profiles';
import { getToolsForToolsets } from './toolsets';

const INTENDED_DEFAULT_TOOLSETS = [
  'core',
  'scheduler',
  'content',
  'generation',
  'analytics',
  'brand',
  'onboarding',
] as const satisfies readonly ToolsetName[];

describe('MCP toolset profiles', () => {
  it('uses default for the bare URL and exposes the three profile names', () => {
    expect(BARE_URL_MCP_PROFILE).toBe('default');
    expect(MCP_PROFILE_NAMES).toEqual(['default', 'directory', 'full']);
    expect(isMcpToolsetProfileName('default')).toBe(true);
    expect(isMcpToolsetProfileName('not-a-profile')).toBe(false);
  });

  it('keeps media upload and get_post on content inside the bare-URL profile', () => {
    const names = new Set(
      getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
        (tool) => tool.name,
      ),
    );
    for (const name of [
      'complete_media_upload',
      'get_post',
      'request_media_upload',
    ]) {
      expect(names.has(name), name).toBe(true);
      expect(
        getToolsForToolsets('mcp', ['core']).some((tool) => tool.name === name),
      ).toBe(false);
    }
  });

  it('keeps the bare-URL profile within the tool cap', () => {
    const tools = getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS);

    expect(tools.length).toBeLessThanOrEqual(BARE_MCP_URL_TOOL_CAP);
    expect(tools.length).toBeGreaterThan(0);
    expect(DEFAULT_MCP_PROFILE_TOOLSETS).toEqual([
      'core',
      'scheduler',
      'content',
    ]);
  });

  it('cannot add the rest of the intended set without crossing the cap', () => {
    // Documents why generation, analytics, brand, and onboarding are not in
    // the default profile. If the catalog shrinks enough that this fails,
    // extend DEFAULT_MCP_PROFILE_TOOLSETS before raising the cap.
    expect(
      getToolsForToolsets('mcp', INTENDED_DEFAULT_TOOLSETS).length,
    ).toBeGreaterThan(BARE_MCP_URL_TOOL_CAP);
  });

  it('builds directory from default minus generation, clips, and ui', () => {
    expect(DIRECTORY_EXCLUDED_TOOLSETS).toEqual(['clips', 'generation', 'ui']);
    expect(DIRECTORY_MCP_PROFILE_TOOLSETS).toEqual(
      DEFAULT_MCP_PROFILE_TOOLSETS.filter(
        (name) => !DIRECTORY_EXCLUDED_TOOLSETS.includes(name),
      ),
    );

    const directoryTools = getToolsForToolsets(
      'mcp',
      DIRECTORY_MCP_PROFILE_TOOLSETS,
    );
    for (const tool of directoryTools) {
      expect(DIRECTORY_EXCLUDED_TOOLSETS).not.toContain(tool.toolset);
    }
    expect(
      directoryTools.some(
        (tool) => tool.toolset === 'generation' || tool.toolset === 'clips',
      ),
    ).toBe(false);
  });

  it('resolves full to the unfiltered catalog and the others to toolset lists', () => {
    expect(resolveMcpProfile('full')).toEqual({ kind: 'all' });
    expect(resolveMcpProfile('default')).toEqual({
      kind: 'toolsets',
      toolsets: DEFAULT_MCP_PROFILE_TOOLSETS,
    });
    expect(resolveMcpProfile('directory')).toEqual({
      kind: 'toolsets',
      toolsets: DIRECTORY_MCP_PROFILE_TOOLSETS,
    });
  });
});
