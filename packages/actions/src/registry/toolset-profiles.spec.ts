import { describe, expect, it } from 'vitest';
import { CLAUDE_MCP_TOOL_NAMES } from './mcp-access-modes';
import { getToolsForSurface } from './tool-registry';
import type { ToolsetName } from './toolset-names';
import {
  BARE_MCP_URL_TOOL_CAP,
  BARE_URL_MCP_PROFILE,
  CONNECTOR_MCP_TOOL_CAP,
  DEFAULT_MCP_PROFILE_TOOLSETS,
  DIRECTORY_EXCLUDED_TOOLSETS,
  DIRECTORY_MCP_PROFILE_TOOLSETS,
  isMcpToolsetProfileName,
  MCP_PROFILE_NAMES,
  resolveMcpProfile,
  STUDIO_MCP_PROFILE_TOOL_CAP,
  STUDIO_MCP_PROFILE_TOOLSETS,
} from './toolset-profiles';
import { getToolsForToolsets } from './toolsets';

const BEYOND_DEFAULT_TOOLSETS = [
  'core',
  'generation',
  'content',
  'scheduler',
  'analytics',
  'brand',
  'onboarding',
] as const satisfies readonly ToolsetName[];

describe('MCP toolset profiles', () => {
  it('loads brand publishing readiness alongside scheduling on the bare URL', () => {
    const names = getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
      (tool) => tool.name,
    );
    expect(names).toContain('list_brand_publishing_readiness');
    expect(names).toContain('create_scheduled_release');
  });

  it('pins the ordinary-role counts of every profile against its cap', () => {
    const userCount = (toolsets: readonly ToolsetName[]) =>
      getToolsForToolsets('mcp', toolsets).filter(
        (tool) => tool.requiredRole === 'user',
      ).length;
    expect(BARE_MCP_URL_TOOL_CAP).toBe(25);
    expect(userCount(DEFAULT_MCP_PROFILE_TOOLSETS)).toBe(25);
    expect(userCount(DIRECTORY_MCP_PROFILE_TOOLSETS)).toBe(19);
    expect(userCount(STUDIO_MCP_PROFILE_TOOLSETS)).toBe(40);
    expect(userCount(DEFAULT_MCP_PROFILE_TOOLSETS)).toBeLessThanOrEqual(
      BARE_MCP_URL_TOOL_CAP,
    );
    expect(userCount(DIRECTORY_MCP_PROFILE_TOOLSETS)).toBeLessThanOrEqual(
      CONNECTOR_MCP_TOOL_CAP,
    );
    expect(userCount(STUDIO_MCP_PROFILE_TOOLSETS)).toBeLessThanOrEqual(
      STUDIO_MCP_PROFILE_TOOL_CAP,
    );
  });

  it('keeps the Claude connector inside the connector cap and free of generation', () => {
    const listed = getToolsForSurface('mcp').filter(
      (tool) =>
        tool.requiredRole === 'user' && CLAUDE_MCP_TOOL_NAMES.has(tool.name),
    );
    expect(listed.length).toBeLessThanOrEqual(CONNECTOR_MCP_TOOL_CAP);
    expect(listed.map((tool) => tool.name)).not.toContain('generate');
    expect(listed.map((tool) => tool.name)).not.toContain('transform_media');
  });

  it('adds brand and analytics to the default for the studio profile', () => {
    expect(STUDIO_MCP_PROFILE_TOOLSETS).toEqual([
      ...DEFAULT_MCP_PROFILE_TOOLSETS,
      'brand',
      'analytics',
    ]);
    expect(resolveMcpProfile('studio')).toEqual({
      kind: 'toolsets',
      toolsets: STUDIO_MCP_PROFILE_TOOLSETS,
    });
    const names = getToolsForToolsets('mcp', STUDIO_MCP_PROFILE_TOOLSETS).map(
      (tool) => tool.name,
    );
    expect(names).toEqual(expect.arrayContaining(['generate', 'list_assets']));
    expect(names).toEqual(
      expect.arrayContaining(['get_analytics', 'get_x_posts']),
    );
  });

  it('uses default for the bare URL and exposes the four profile names', () => {
    expect(BARE_URL_MCP_PROFILE).toBe('default');
    expect(MCP_PROFILE_NAMES).toEqual([
      'default',
      'directory',
      'studio',
      'full',
    ]);
    expect(isMcpToolsetProfileName('default')).toBe(true);
    expect(isMcpToolsetProfileName('not-a-profile')).toBe(false);
  });

  it('keeps media upload and get_posts on content inside the bare-URL profile', () => {
    const names = new Set<string>(
      getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
        (tool) => tool.name,
      ),
    );
    for (const name of ['upload_media', 'get_posts']) {
      expect(names.has(name), name).toBe(true);
      expect(
        getToolsForToolsets('mcp', ['core']).some((tool) => tool.name === name),
      ).toBe(false);
    }
  });

  it('keeps the bare-URL profile within the tool cap', () => {
    const tools = getToolsForToolsets(
      'mcp',
      DEFAULT_MCP_PROFILE_TOOLSETS,
    ).filter((tool) => tool.requiredRole === 'user');

    expect(tools.length).toBeLessThanOrEqual(BARE_MCP_URL_TOOL_CAP);
    expect(tools.length).toBeGreaterThan(0);
    expect(DEFAULT_MCP_PROFILE_TOOLSETS).toEqual([
      'core',
      'generation',
      'content',
      'scheduler',
    ]);
  });

  it('loads generation and the generate tool on the bare-URL default profile', () => {
    expect(DEFAULT_MCP_PROFILE_TOOLSETS).toContain('generation');
    const names = getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
      (tool) => tool.name,
    );
    expect(names).toContain('generate');
    expect(names).not.toContain('generate_image');
    expect(names).not.toContain('generate_video');
    expect(names).not.toContain('generate_voice');
    expect(names).not.toContain('generate_music');
  });

  it('cannot add analytics, brand, and onboarding without crossing the cap', () => {
    // Documents why analytics, brand, and onboarding are not in the default
    // profile. If the catalog shrinks enough that this fails, extend
    // DEFAULT_MCP_PROFILE_TOOLSETS before raising the cap.
    expect(
      getToolsForToolsets('mcp', BEYOND_DEFAULT_TOOLSETS).length,
    ).toBeGreaterThan(BARE_MCP_URL_TOOL_CAP);
  });

  it('builds directory from default minus generation, clips, and ui', () => {
    expect(DIRECTORY_EXCLUDED_TOOLSETS).toEqual([
      'clipper',
      'generation',
      'ui',
    ]);
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
        (tool) => tool.toolset === 'generation' || tool.toolset === 'clipper',
      ),
    ).toBe(false);
    expect(directoryTools.map((tool) => tool.name)).not.toContain('generate');
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
