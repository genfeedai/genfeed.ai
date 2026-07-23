import { describe, expect, it } from 'vitest';
import {
  CURATED_ACTION_CATALOG,
  isActionOnSurface,
} from './curated-action-catalog.js';
import { SOURCE_TOOLS } from './source/index.js';
import {
  ALL_TOOLS,
  getToolByName,
  getToolsForSurface,
} from './tool-registry.js';

describe('curated action catalog', () => {
  it('is deterministically sorted with unique action names', () => {
    const names = CURATED_ACTION_CATALOG.map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares a non-empty, duplicate-free surface set for every action', () => {
    for (const entry of CURATED_ACTION_CATALOG) {
      expect(entry.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(entry.surfaces.length).toBeGreaterThan(0);
      expect(new Set(entry.surfaces).size).toBe(entry.surfaces.length);
      expect(
        entry.surfaces.every(
          (surface) => surface === 'agent' || surface === 'mcp',
        ),
      ).toBe(true);
    }
  });

  it('has exactly one definition for every reviewed action and no extras', () => {
    const catalogNames = CURATED_ACTION_CATALOG.map((entry) => entry.name);
    const definitionNames = SOURCE_TOOLS.map((tool) => tool.name).sort((a, b) =>
      a.localeCompare(b),
    );

    expect(definitionNames).toEqual(catalogNames);
    expect(new Set(definitionNames).size).toBe(definitionNames.length);
  });

  it('derives runtime surfaces exclusively from the catalog', () => {
    expect(ALL_TOOLS).toHaveLength(CURATED_ACTION_CATALOG.length);

    for (const entry of CURATED_ACTION_CATALOG) {
      const tool = getToolByName(entry.name);
      expect(tool, entry.name).toBeDefined();
      expect(tool?.surfaces).toEqual({
        agent: isActionOnSurface(entry, 'agent'),
        cliAgentVisible: isActionOnSurface(entry, 'agent'),
        mcp: isActionOnSurface(entry, 'mcp'),
      });
    }
  });

  it('lists exactly the cataloged actions on each runtime surface', () => {
    for (const surface of ['agent', 'mcp'] as const) {
      const expected = CURATED_ACTION_CATALOG.filter((entry) =>
        isActionOnSurface(entry, surface),
      ).map((entry) => entry.name);
      const actual = getToolsForSurface(surface).map((tool) => tool.name);
      expect(actual).toEqual(expected);
    }
  });

  it('contains no generated endpoint mirrors', () => {
    expect(ALL_TOOLS.some((tool) => tool.name.includes('__'))).toBe(false);
  });

  it('publishes Instagram inspiration and review-only remix schemas on both surfaces', () => {
    const listTool = getToolByName('list_instagram_inspiration');
    const remixTool = getToolByName('create_instagram_remix_workflow');

    expect(listTool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(listTool?.parameters.properties).toHaveProperty('brandId');
    expect(remixTool?.surfaces).toMatchObject({ agent: true, mcp: true });
    expect(remixTool?.parameters.required).toEqual(['username', 'shortcode']);
    expect(remixTool?.description).toContain('review-only');

    for (const name of [
      'list_ads_research',
      'get_ad_research_detail',
      'create_ad_remix_workflow',
    ]) {
      expect(getToolByName(name)?.surfaces).toMatchObject({
        agent: true,
        mcp: true,
      });
    }
  });
});
