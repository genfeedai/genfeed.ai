import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../../adapters/to-mcp-tool';
import {
  CURATED_ACTION_CATALOG,
  isPublishingApprovalRequired,
} from '../curated-action-catalog';
import { isApprovalRequiredToolName } from '../mutation-policy';
import { ALL_TOOLS, getToolByName, getToolsForSurface } from '../tool-registry';

const READ_ONLY_PREFIXES = [
  'describe_',
  'get_',
  'list_',
  'search_',
  'validate_',
] as const;

const SCHEDULER_WRITES = [
  'control_scheduled_release',
  'create_scheduled_release',
  'update_scheduled_release',
] as const;

describe('MCP tool annotations', () => {
  it('puts a title and all four hints on every MCP-surfaced tool', () => {
    const mcpTools = getToolsForSurface('mcp');
    expect(mcpTools.length).toBeGreaterThan(0);

    for (const tool of mcpTools) {
      expect(tool.title, tool.name).toEqual(expect.any(String));
      expect(tool.title?.length, tool.name).toBeGreaterThan(0);
      expect(tool.annotations?.readOnlyHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations?.destructiveHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations?.idempotentHint, tool.name).toEqual(
        expect.any(Boolean),
      );
      expect(tool.annotations?.openWorldHint, tool.name).toEqual(
        expect.any(Boolean),
      );
    }

    for (const listed of toMcpTools(mcpTools)) {
      expect(listed.title, listed.name).toBe(getToolByName(listed.name)?.title);
      expect(listed.annotations, listed.name).toEqual(
        getToolByName(listed.name)?.annotations,
      );
    }
  });

  it('does not annotate agent-only tools', () => {
    const agentOnly = ALL_TOOLS.filter((tool) => !tool.surfaces.mcp);
    expect(agentOnly.length).toBeGreaterThan(0);
    for (const tool of agentOnly) {
      expect(tool.title, tool.name).toBeUndefined();
      expect(tool.annotations, tool.name).toBeUndefined();
    }
  });

  it('marks approval-required tools destructive and not read-only', () => {
    for (const tool of getToolsForSurface('mcp')) {
      if (!isApprovalRequiredToolName(tool.name)) continue;
      // MCP create_post only saves a draft; publishing is create_scheduled_release.
      if (tool.name === 'create_post') continue;
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(false);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(true);
      expect(tool.annotations?.idempotentHint, tool.name).toBe(false);
    }
  });

  it('marks prefixed reads read-only, idempotent, and not destructive', () => {
    for (const tool of getToolsForSurface('mcp')) {
      const matchesPrefix = READ_ONLY_PREFIXES.some((prefix) =>
        tool.name.startsWith(prefix),
      );
      if (!matchesPrefix) continue;
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      expect(tool.annotations?.idempotentHint, tool.name).toBe(true);
    }
  });

  it('pins the reviewed exceptions', () => {
    expect(getToolByName('resolve_approval')?.annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    for (const name of SCHEDULER_WRITES) {
      expect(getToolByName(name)?.annotations?.destructiveHint, name).toBe(
        true,
      );
      expect(getToolByName(name)?.annotations?.readOnlyHint, name).toBe(false);
    }
    for (const name of [
      'get_account_info',
      'list_brands',
      'validate_scheduler_target',
    ]) {
      expect(getToolByName(name)?.annotations?.readOnlyHint, name).toBe(true);
      expect(getToolByName(name)?.annotations?.destructiveHint, name).toBe(
        false,
      );
    }
  });

  it('marks generation and publishing tools open-world', () => {
    const publishing = new Set(
      CURATED_ACTION_CATALOG.filter((entry) =>
        isPublishingApprovalRequired(entry),
      ).map((entry) => entry.name),
    );

    for (const tool of getToolsForSurface('mcp')) {
      const isOpenWorld =
        tool.name.startsWith('generate_') ||
        tool.name === 'reframe_image' ||
        tool.name === 'upscale_image' ||
        publishing.has(tool.name);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(isOpenWorld);
    }
  });

  it('keeps media upload and get_post hints off the global write default', () => {
    expect(getToolByName('request_media_upload')?.annotations).toMatchObject({
      destructiveHint: false,
      readOnlyHint: true,
    });
    expect(getToolByName('get_post')?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: true,
      readOnlyHint: true,
    });
    expect(getToolByName('complete_media_upload')?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
      readOnlyHint: false,
    });
    expect(getToolByName('complete_media_upload')?.mutationPolicy).toBe(
      'direct',
    );
    expect(
      getToolByName('request_media_upload')?.mutationPolicy,
    ).toBeUndefined();
    expect(getToolByName('get_post')?.toolset).toBe('content');
    expect(getToolByName('request_media_upload')?.toolset).toBe('content');
    expect(getToolByName('complete_media_upload')?.toolset).toBe('content');
  });

  it('derives a title from the tool name', () => {
    expect(getToolByName('get_account_info')?.title).toBe('Get Account Info');
    expect(getToolByName('create_post')?.title).toBe('Create Post');
  });

  it('marks MCP create_post as a non-destructive draft', () => {
    const tool = getToolByName('create_post');
    expect(tool?.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: false,
      readOnlyHint: false,
    });
    expect(tool?.description).toContain('create_scheduled_release');
    expect(tool?.description).toContain('never publishes');
    expect(tool?.mutationPolicy).toBe('approval-required');
    expect(tool?.toolset).toBe('content');
  });
});
