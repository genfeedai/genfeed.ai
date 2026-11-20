import { describe, expect, it } from 'vitest';
import { resolveMcpAppToolsets } from './app-toolsets';
import {
  CLAUDE_MCP_TOOL_NAMES,
  isToolAllowedInMcpAccessMode,
} from './mcp-access-modes';
import { MCP_CATALOG_TOOLS } from './mcp-catalog/catalog';
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

describe('MCP toolset profiles', () => {
  it('loads brand publishing readiness alongside scheduling on the bare URL', () => {
    const names = getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
      (tool) => tool.name,
    );
    expect(names).toContain('check_channel');
    expect(names).toContain('schedule_release');
  });

  it('pins the ordinary-role counts of every profile against its cap', () => {
    const userCount = (toolsets: readonly ToolsetName[]) =>
      getToolsForToolsets('mcp', toolsets).filter(
        (tool) => tool.requiredRole === 'user',
      ).length;
    expect(BARE_MCP_URL_TOOL_CAP).toBe(30);
    expect(userCount(DEFAULT_MCP_PROFILE_TOOLSETS)).toBe(25);
    expect(userCount(DIRECTORY_MCP_PROFILE_TOOLSETS)).toBe(25);
    expect(userCount(STUDIO_MCP_PROFILE_TOOLSETS)).toBe(26);
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

  it('lists the review queue and task management on every selection through merged tools', () => {
    const defaults = getToolsForToolsets(
      'mcp',
      DEFAULT_MCP_PROFILE_TOOLSETS,
    ).map((tool) => tool.name);
    expect(defaults).toEqual(
      expect.arrayContaining(['get_workspace', 'manage_workspace']),
    );
    expect(defaults).not.toContain('manage_task');
  });

  it('keeps the Claude connector inside the connector cap and free of generation', () => {
    const listed = getToolsForSurface('mcp').filter(
      (tool) =>
        tool.requiredRole === 'user' && CLAUDE_MCP_TOOL_NAMES.has(tool.name),
    );
    expect(listed.length).toBeLessThanOrEqual(CONNECTOR_MCP_TOOL_CAP);
    expect(listed.map((tool) => tool.name)).not.toContain('generate_media');
  });

  it('keeps Brand Kit edits out of the Claude connector', () => {
    const edits = [
      'draft_brand_voice_profile',
      'manage_brand_kit',
      'save_brand_voice_profile',
    ];
    expect(edits.filter((name) => CLAUDE_MCP_TOOL_NAMES.has(name))).toEqual([]);
    for (const name of edits)
      expect(isToolAllowedInMcpAccessMode('claude', name), name).toBe(false);
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
    expect(names).toEqual(
      expect.arrayContaining(['generate_media', 'get_assets']),
    );
    expect(names).toEqual(
      expect.arrayContaining(['get_insights', 'fetch_x_posts']),
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

  it('lists every merged tool on every selection', () => {
    for (const toolsets of [['core'], DEFAULT_MCP_PROFILE_TOOLSETS] as const) {
      const names = new Set<string>(
        getToolsForToolsets('mcp', toolsets).map((tool) => tool.name),
      );
      for (const { name } of MCP_CATALOG_TOOLS)
        expect(names.has(name), name).toBe(true);
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
      'insights',
    ]);
  });

  it('lists get_insights on the bare URL and on every selection that had the reads', () => {
    const listed = (toolsets: readonly ToolsetName[]) =>
      getToolsForToolsets('mcp', toolsets).map((tool) => tool.name);
    for (const toolsets of [
      DEFAULT_MCP_PROFILE_TOOLSETS,
      DIRECTORY_MCP_PROFILE_TOOLSETS,
      STUDIO_MCP_PROFILE_TOOLSETS,
      ['analytics'] as const,
      [...resolveMcpAppToolsets(['analytics'])],
    ]) {
      expect(listed(toolsets)).toContain('get_insights');
    }
  });

  it('lets a bare-URL client draft, preview and request publication of an article (#10073)', () => {
    const names = getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
      (tool) => tool.name,
    );
    expect(names).toEqual(
      expect.arrayContaining(['control_release', 'get_content', 'save_post']),
    );
  });

  it('loads generation and the generate_media tool on the bare-URL default profile', () => {
    expect(DEFAULT_MCP_PROFILE_TOOLSETS).toContain('generation');
    const names = getToolsForToolsets('mcp', DEFAULT_MCP_PROFILE_TOOLSETS).map(
      (tool) => tool.name,
    );
    expect(names).toContain('generate_media');
    expect(names).not.toContain('generate_image');
    expect(names).not.toContain('generate_video');
    expect(names).not.toContain('generate_voice');
    expect(names).not.toContain('generate_music');
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
    // A merged tool is listed on every selection, whatever toolset its first
    // action came from. Each action is still gated by the tool it runs, and the
    // Claude connector lists only the actions it allows (never generate_media).
    const excluded = directoryTools.filter((tool) =>
      DIRECTORY_EXCLUDED_TOOLSETS.includes(tool.toolset),
    );
    expect(excluded.map((tool) => tool.name).sort()).toEqual([
      'generate_media',
      'get_generation_catalog',
      'get_video_projects',
    ]);
    for (const tool of excluded.filter(
      (entry) => entry.name !== 'generate_media',
    ))
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
    expect(CLAUDE_MCP_TOOL_NAMES.has('generate_media')).toBe(false);
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
