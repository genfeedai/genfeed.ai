import { describe, expect, it } from 'vitest';
import {
  ADMIN_MCP_TOOL_NAMES,
  CLAUDE_MCP_AGENT_TOOL_NAMES,
  CLAUDE_MCP_TOOL_NAMES,
  isToolAllowedInMcpAccessMode,
  mostRestrictiveMcpAccessMode,
  parseMcpAccessMode,
} from './mcp-access-modes';
import { getToolsForSurface } from './tool-registry';

describe('Claude MCP access policy', () => {
  it('consolidates scheduler listing without changing the exact old agent allowlist', () => {
    expect(CLAUDE_MCP_TOOL_NAMES.size).toBe(31);
    expect(CLAUDE_MCP_TOOL_NAMES.has('check_channel')).toBe(true);
    // Approval-gated: the Claude connector queues it, a reviewer in the app releases it (#10073).
    expect(CLAUDE_MCP_TOOL_NAMES.has('publish_article')).toBe(true);
    expect(isToolAllowedInMcpAccessMode('claude', 'publish_article')).toBe(
      true,
    );
    expect([...CLAUDE_MCP_AGENT_TOOL_NAMES].sort()).toEqual(
      [
        'get_account',
        'get_brands',
        'find_tools',
        'onboard_brand',
        'get_brand_context',
        'get_brand_completeness',
        'get_brand_scan_status',
        'get_brand_publishing_readiness',
        'create_brand_from_url',
        'start_brand_interview',
        'submit_brand_interview_answer',
        'skip_brand_interview_question',
        'create_post',
        'get_posts',
        'get_articles',
        'create_article_draft',
        'get_article_preview',
        'get_scheduler_capabilities',
        'validate_scheduler_target',
        'create_scheduled_release',
        'get_scheduled_release',
        'update_scheduled_release',
        'control_scheduled_release',
        'get_analytics',
        'analyze_performance',
        'get_content_analytics',
        'get_video_analytics',
        'get_linkedin_analytics',
        'get_linkedin_connection_status',
        'get_trends',
        'get_assets',
        'scan_brand_url',
        'save_onboarding_answers',
        'complete_onboarding',
      ].sort(),
    );
    for (const name of [
      'get_scheduler_capabilities',
      'validate_scheduler_target',
    ]) {
      expect(CLAUDE_MCP_TOOL_NAMES.has(name)).toBe(false);
      expect(isToolAllowedInMcpAccessMode('claude', name)).toBe(true);
      expect(isToolAllowedInMcpAccessMode('claude', name, 'agent')).toBe(true);
    }
    for (const name of [
      'upload_media',
      'request_media_upload',
      'complete_media_upload',
    ]) {
      expect(isToolAllowedInMcpAccessMode('claude', name)).toBe(false);
      expect(isToolAllowedInMcpAccessMode('claude', name, 'agent')).toBe(false);
    }
    expect(
      isToolAllowedInMcpAccessMode('claude', 'check_channel', 'agent'),
    ).toBe(false);
  });
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
    const catalog = new Set<string>(
      getToolsForSurface('mcp').map((tool) => tool.name),
    );
    for (const name of CLAUDE_MCP_TOOL_NAMES) {
      expect(catalog.has(name), name).toBe(true);
      expect([
        'clipper',
        'visual-code',
        'workflows',
        'inspiration',
        'agent-chat',
        'skills-pro',
      ]).not.toContain(
        getToolsForSurface('mcp').find((tool) => tool.name === name)?.toolset,
      );
    }
    for (const name of [
      'generate',
      'transform_media',
      'generate_turbo_content',
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

describe('Admin MCP access policy', () => {
  it('lists exactly the admin-gated MCP tools', () => {
    expect([...ADMIN_MCP_TOOL_NAMES].sort()).toEqual(
      getToolsForSurface('mcp')
        .filter((tool) => tool.requiredRole !== 'user')
        .map((tool) => tool.name)
        .sort(),
    );
    expect(ADMIN_MCP_TOOL_NAMES.has('resolve_approval')).toBe(true);
    expect(ADMIN_MCP_TOOL_NAMES.has('create_brand_from_url')).toBe(true);
  });

  it('keeps admin tools off the standard and Claude endpoints', () => {
    for (const name of ADMIN_MCP_TOOL_NAMES) {
      expect(isToolAllowedInMcpAccessMode('standard', name), name).toBe(false);
      expect(isToolAllowedInMcpAccessMode('claude', name), name).toBe(false);
      expect(isToolAllowedInMcpAccessMode('admin', name), name).toBe(true);
    }
  });

  it('leaves every other tool on the standard endpoint and off the admin one', () => {
    for (const tool of getToolsForSurface('mcp')) {
      if (ADMIN_MCP_TOOL_NAMES.has(tool.name)) continue;
      expect(isToolAllowedInMcpAccessMode('standard', tool.name)).toBe(true);
      expect(isToolAllowedInMcpAccessMode('admin', tool.name), tool.name).toBe(
        false,
      );
    }
  });

  it('does not restrict the in-app agent surface on standard', () => {
    expect(
      isToolAllowedInMcpAccessMode(
        'standard',
        'create_brand_from_url',
        'agent',
      ),
    ).toBe(true);
  });

  it('keeps admin only when every mode is admin', () => {
    expect(parseMcpAccessMode('admin')).toBe('admin');
    expect(mostRestrictiveMcpAccessMode('admin', 'admin')).toBe('admin');
    expect(mostRestrictiveMcpAccessMode(undefined, 'admin')).toBe('admin');
    expect(mostRestrictiveMcpAccessMode('admin', 'standard')).toBe('standard');
    expect(mostRestrictiveMcpAccessMode('standard', 'admin')).toBe('standard');
    expect(mostRestrictiveMcpAccessMode('admin', 'claude')).toBe('claude');
    expect(mostRestrictiveMcpAccessMode(undefined)).toBe('standard');
  });
});
