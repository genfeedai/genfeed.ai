import { describe, expect, it } from 'vitest';
import {
  CLAUDE_MCP_AGENT_TOOL_NAMES,
  CLAUDE_MCP_TOOL_NAMES,
  isToolAllowedInMcpAccessMode,
  mostRestrictiveMcpAccessMode,
  parseMcpAccessMode,
} from './mcp-access-modes';
import { getToolByName, getToolsForSurface } from './tool-registry';

describe('Claude MCP access policy', () => {
  it('fails closed for unknown modes and never widens a restricted grant', () => {
    expect(parseMcpAccessMode(undefined)).toBe('standard');
    for (const value of [null, '', 'full', {}, 'claude']) {
      expect(parseMcpAccessMode(value)).toBe('claude');
    }
    expect(mostRestrictiveMcpAccessMode('standard', 'claude')).toBe('claude');
    expect(mostRestrictiveMcpAccessMode('claude', 'standard')).toBe('claude');
    expect(
      isToolAllowedInMcpAccessMode('claude', 'future_generation_tool'),
    ).toBe(false);
  });

  it('allows only existing content operations and read-only assets', () => {
    const catalog = new Set(getToolsForSurface('mcp').map((tool) => tool.name));
    for (const name of CLAUDE_MCP_TOOL_NAMES) {
      expect(catalog.has(name), name).toBe(true);
      expect([
        'clips',
        'visual-code',
        'workflows',
        'inspiration',
        'agent-chat',
        'skills-pro',
      ]).not.toContain(getToolByName(name)?.toolset);
    }
    for (const name of [
      'generate',
      'transform_media',
      'generate_content_batch',
      'execute_workflow',
      'start_remix_generation',
      'resolve_approval',
      'send_chat_message',
    ]) {
      expect(isToolAllowedInMcpAccessMode('claude', name)).toBe(false);
      expect(isToolAllowedInMcpAccessMode('claude', name, 'agent')).toBe(false);
    }
    for (const name of [
      'scan_brand_url',
      'save_onboarding_answers',
      'complete_onboarding',
    ]) {
      expect(CLAUDE_MCP_AGENT_TOOL_NAMES.has(name)).toBe(true);
    }
  });
});
