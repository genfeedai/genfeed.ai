import { MCP_TOOL_CAP } from '@genfeedai/mcp-kit';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MCP_TOOL_NAMES,
  isToolAllowedInMcpAccessMode,
} from './mcp-access-modes';
import { MCP_CATALOG_TOOLS } from './mcp-catalog/catalog';
import { getToolsForRole } from './tool-registry';

describe('MCP tool cap', () => {
  const listed = () => getToolsForRole('mcp', 'user');

  it('lists at most 30 tools to an ordinary caller, on every connection', () => {
    expect(MCP_TOOL_CAP).toBe(30);
    expect(listed().length).toBe(30);
    expect(listed().length).toBeLessThanOrEqual(MCP_TOOL_CAP);
  });

  it('lists every merged tool', () => {
    const names = new Set(listed().map((tool) => tool.name));
    for (const { name } of MCP_CATALOG_TOOLS)
      expect(names.has(name), name).toBe(true);
  });

  it('lists the tools a client plans a make, review and publish loop with', () => {
    expect(listed().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'check_channel',
        'control_release',
        'find_tools',
        'generate_media',
        'generate_text',
        'get_assets',
        'get_content',
        'get_context',
        'get_insights',
        'save_post',
        'schedule_release',
        'setup_brand',
      ]),
    );
  });

  it('keeps the Claude connector inside the cap and free of generation', () => {
    const claude = listed().filter((tool) =>
      CLAUDE_MCP_TOOL_NAMES.has(tool.name),
    );
    expect(claude.length).toBeLessThanOrEqual(MCP_TOOL_CAP);
    for (const name of ['generate_media', 'generate_text', 'run_video_project'])
      expect(CLAUDE_MCP_TOOL_NAMES.has(name), name).toBe(false);
  });

  it('keeps Brand Kit edits out of the Claude connector', () => {
    for (const name of [
      'draft_brand_voice_profile',
      'manage_brand_kit',
      'save_brand_voice_profile',
    ])
      expect(isToolAllowedInMcpAccessMode('claude', name), name).toBe(false);
  });
});
