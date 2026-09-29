import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from './tool-assembly';
import {
  CORE_TOOLSET_NAME,
  getToolsetNames,
  getToolsets,
  getToolsForToolsets,
  isToolsetName,
  parseToolsetSelection,
  TOOLSET_NAMES,
  TOOLSETS,
} from './toolsets';

describe('parseToolsetSelection', () => {
  it('treats undefined as no selection', () => {
    expect(parseToolsetSelection(undefined)).toEqual({
      empty: [],
      toolsets: [],
      unknown: [],
    });
  });

  it('trims, lowercases, dedupes, and drops empty segments from a comma-separated string', () => {
    expect(parseToolsetSelection('Content, GENERATION ,,')).toEqual({
      empty: [],
      toolsets: ['content', 'generation'],
      unknown: [],
    });
  });

  it('dedupes a name that repeats after normalization', () => {
    expect(parseToolsetSelection('content,Content, content ')).toEqual({
      empty: [],
      toolsets: ['content'],
      unknown: [],
    });
  });

  it('treats an empty array as no selection', () => {
    expect(parseToolsetSelection([])).toEqual({
      empty: [],
      toolsets: [],
      unknown: [],
    });
  });

  it('with surface "mcp", keeps a declared toolset that has no tools on that surface', () => {
    // Empty-on-this-deploy is not unknown. The name stays selected so the
    // caller does not widen to every tool, and `empty` is how list_toolsets
    // warns instead of the connection failing.
    expect(parseToolsetSelection('goals', 'mcp')).toEqual({
      empty: ['goals'],
      toolsets: ['goals'],
      unknown: [],
    });
  });

  it('with a surface, reports empty-on-surface names separately from undeclared names', () => {
    expect(parseToolsetSelection('content,goals,bogus', 'mcp')).toEqual({
      empty: ['goals'],
      toolsets: ['content', 'goals'],
      unknown: ['bogus'],
    });
  });
});

describe('getToolsetNames', () => {
  it('always includes core', () => {
    for (const surface of ['agent', 'mcp'] as const) {
      expect(getToolsetNames(surface)).toContain(CORE_TOOLSET_NAME);
    }
  });
});

describe('isToolsetName', () => {
  it('rejects an unknown string', () => {
    expect(isToolsetName('not-a-real-toolset')).toBe(false);
  });
});

describe('getToolsets', () => {
  it('only returns toolsets with at least one tool on the requested surface', () => {
    for (const surface of ['agent', 'mcp'] as const) {
      const summaries = getToolsets(surface);
      for (const summary of summaries) {
        expect(summary.toolCount).toBeGreaterThan(0);
        expect(summary.toolNames.length).toBe(summary.toolCount);
      }
    }
  });

  it('always includes core with an accurate tool count on both surfaces', () => {
    for (const surface of ['agent', 'mcp'] as const) {
      const core = getToolsets(surface).find(
        (summary) => summary.name === CORE_TOOLSET_NAME,
      );
      const expectedCount = ALL_TOOLS.filter(
        (tool) => tool.toolset === CORE_TOOLSET_NAME && tool.surfaces[surface],
      ).length;
      expect(core, surface).toBeDefined();
      expect(core?.toolCount, surface).toBe(expectedCount);
      expect(core?.isAlwaysOn, surface).toBe(true);
    }
  });
});

describe('getToolsForToolsets', () => {
  it('returns every tool on the surface when the selection is empty', () => {
    for (const surface of ['agent', 'mcp'] as const) {
      const expected = ALL_TOOLS.filter((tool) => tool.surfaces[surface]).sort(
        (a, b) => a.name.localeCompare(b.name),
      );
      expect(getToolsForToolsets(surface, [])).toEqual(expected);
    }
  });

  it('unions the selection with core and drops tools outside both', () => {
    const result = getToolsForToolsets('mcp', ['content']);
    const resultNames = new Set(result.map((tool) => tool.name));

    for (const tool of result) {
      expect(['content', CORE_TOOLSET_NAME]).toContain(tool.toolset);
    }
    // A tool from an unrelated toolset must not leak in.
    expect(resultNames.has('generate_image')).toBe(false);
    // Core is always present even when not explicitly requested.
    expect(resultNames.has('list_toolsets')).toBe(true);
  });
});

describe('TOOLSETS', () => {
  it('is sorted by name and matches TOOLSET_NAMES exactly', () => {
    const names = TOOLSETS.map((definition) => definition.name);
    expect(names).toEqual([...TOOLSET_NAMES]);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
