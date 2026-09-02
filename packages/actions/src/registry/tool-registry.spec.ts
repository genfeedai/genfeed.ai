import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceTool } from '../interfaces/source-tool.interface';
import type { ToolCategory } from '../interfaces/tool-definition.interface';
import type {
  CuratedActionCatalogEntry,
  CuratedActionSurface,
} from './curated-action-catalog';
import {
  ALL_TOOLS,
  getToolByName,
  getToolsByCategory,
  getToolsForRole,
  getToolsForSurface,
} from './tool-registry';

describe('tool registry', () => {
  it('sorts the canonical tool list by name', () => {
    const names = ALL_TOOLS.map((tool) => tool.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('resolves a cataloged action by name and misses unknown names', () => {
    expect(getToolByName('generate_image')?.name).toBe('generate_image');
    expect(getToolByName('not_a_real_action')).toBeUndefined();
  });

  it('treats the cli surface as the agent-visible set', () => {
    expect(getToolsForSurface('cli')).toEqual(getToolsForSurface('agent'));
    for (const tool of getToolsForSurface('cli')) {
      expect(tool.surfaces.cliAgentVisible, tool.name).toBe(true);
    }
  });

  it('partitions every tool into exactly one category', () => {
    const categories = new Set<ToolCategory>(
      ALL_TOOLS.map((tool) => tool.category),
    );
    let total = 0;
    for (const category of categories) {
      const tools = getToolsByCategory(category);
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.category, tool.name).toBe(category);
      }
      total += tools.length;
    }
    expect(total).toBe(ALL_TOOLS.length);
  });

  it('infers the reviewed category for representative actions', () => {
    const expected: ReadonlyArray<readonly [string, ToolCategory]> = [
      ['create_outreach_sequence', 'campaign'],
      ['create_brand', 'onboarding'],
      ['prepare_generation', 'ui'],
      ['get_analytics', 'analytics'],
      ['create_workflow', 'workflow'],
      ['create_post', 'content'],
      ['list_scheduler_capabilities', 'content'],
      ['generate_image', 'generation'],
      ['initiate_oauth_connect', 'social'],
      ['get_meta_ad_insights', 'ads'],
      ['discover_engagements', 'proactive'],
      ['generate_as_identity', 'identity'],
      ['request_asset', 'agent-control'],
      ['get_credits_balance', 'other'],
    ];
    for (const [name, category] of expected) {
      expect(getToolByName(name)?.category, name).toBe(category);
    }
  });

  it('attaches a UI action type only to mapped actions', () => {
    expect(getToolByName('generate_image')?.uiActionType).toBe(
      'generation_action_card',
    );
    expect(getToolByName('schedule_post')?.uiActionType).toBe(
      'schedule_post_card',
    );
    expect(getToolByName('list_posts')?.uiActionType).toBeUndefined();
  });

  it('widens the visible set as the role escalates', () => {
    const userTools = getToolsForRole('mcp', 'user');
    const adminTools = getToolsForRole('mcp', 'admin');
    const superadminTools = getToolsForRole('mcp', 'superadmin');

    expect(userTools.every((tool) => tool.requiredRole === 'user')).toBe(true);
    expect(adminTools.every((tool) => tool.requiredRole !== 'superadmin')).toBe(
      true,
    );
    expect(userTools.length).toBeLessThanOrEqual(adminTools.length);
    expect(adminTools.length).toBeLessThanOrEqual(superadminTools.length);
    expect(superadminTools).toEqual(getToolsForSurface('mcp'));
    expect(
      superadminTools.some((tool) => tool.requiredRole === 'superadmin'),
    ).toBe(true);
  });

  it('scopes role filtering to the requested surface', () => {
    for (const tool of getToolsForRole('agent', 'user')) {
      expect(tool.surfaces.agent, tool.name).toBe(true);
    }
  });
});

describe('tool registry catalog validation', () => {
  afterEach(() => {
    vi.doUnmock('./curated-action-catalog');
    vi.doUnmock('./source/index');
    vi.resetModules();
  });

  it('rejects duplicate, missing, and unreviewed definitions at load time', async () => {
    function buildSourceTool(name: string): SourceTool {
      return {
        creditCost: 0,
        description: `Definition for ${name}`,
        name,
        parameters: { properties: {}, type: 'object' },
        requiredRole: 'user',
      };
    }
    const catalog: CuratedActionCatalogEntry[] = [
      { name: 'duplicated_action', surfaces: ['agent'] },
      { name: 'duplicated_action', surfaces: ['mcp'] },
      { name: 'missing_action', surfaces: ['mcp'] },
    ];

    vi.doMock('./curated-action-catalog', () => ({
      CURATED_ACTION_CATALOG: catalog,
      isActionOnSurface: (
        entry: CuratedActionCatalogEntry,
        surface: CuratedActionSurface,
      ) => entry.surfaces.some((candidate) => candidate === surface),
    }));
    vi.doMock('./source/index', () => ({
      SOURCE_TOOLS: [
        buildSourceTool('duplicated_action'),
        buildSourceTool('duplicated_action'),
        buildSourceTool('unreviewed_action'),
      ],
    }));
    vi.resetModules();

    await expect(import('./tool-registry')).rejects.toThrow(
      /Invalid curated action catalog: duplicate definitions: duplicated_action; duplicate catalog entries: duplicated_action; missing definitions: missing_action; definitions absent from the curated catalog: unreviewed_action/,
    );
  });
});
