import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from './tool-assembly';
import {
  CORE_TOOLSET_NAME,
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
      toolsets: [],
      unknown: [],
    });
  });

  it('treats an empty string as no selection', () => {
    expect(parseToolsetSelection('')).toEqual({ toolsets: [], unknown: [] });
  });

  it('trims, lowercases, dedupes, and drops empty segments from a comma-separated string', () => {
    expect(parseToolsetSelection('Content, GENERATION ,,')).toEqual({
      toolsets: ['content', 'generation'],
      unknown: [],
    });
  });

  it('dedupes a name that repeats after normalization', () => {
    expect(parseToolsetSelection('content,Content, content ')).toEqual({
      toolsets: ['content'],
      unknown: [],
    });
  });

  it('accepts an array of comma-separated strings (repeated query param)', () => {
    expect(parseToolsetSelection(['content', 'generation,ads'])).toEqual({
      toolsets: ['content', 'generation', 'ads'],
      unknown: [],
    });
  });

  it('treats an empty array as no selection', () => {
    expect(parseToolsetSelection([])).toEqual({ toolsets: [], unknown: [] });
  });

  it('collects unknown names separately from valid ones', () => {
    expect(parseToolsetSelection('content,not-a-toolset,also-fake')).toEqual({
      toolsets: ['content'],
      unknown: ['not-a-toolset', 'also-fake'],
    });
  });

  it('reports only unknown names when nothing valid is present', () => {
    expect(parseToolsetSelection('bogus')).toEqual({
      toolsets: [],
      unknown: ['bogus'],
    });
  });
});

describe('isToolsetName', () => {
  it('accepts every declared toolset name', () => {
    for (const name of TOOLSET_NAMES) {
      expect(isToolsetName(name)).toBe(true);
    }
  });

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

  it('sorts tool names within each toolset summary', () => {
    for (const summary of getToolsets('mcp')) {
      expect(summary.toolNames).toEqual(
        [...summary.toolNames].sort((a, b) => a.localeCompare(b)),
      );
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

  it('never duplicates a tool that is itself in the core toolset', () => {
    const result = getToolsForToolsets('mcp', [CORE_TOOLSET_NAME, 'content']);
    const names = result.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('sorts the result by name', () => {
    const result = getToolsForToolsets('mcp', ['ads', 'content']);
    const names = result.map((tool) => tool.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('returns an empty array for a surface with no matching tools in the selection', () => {
    // "goals" has no MCP-surfaced tools, and core is still returned because
    // it is always unioned in — assert the non-core toolset itself
    // contributes nothing rather than asserting the whole result is empty.
    const result = getToolsForToolsets('mcp', ['goals']);
    expect(result.every((tool) => tool.toolset !== 'goals')).toBe(true);
  });
});

describe('TOOLSETS', () => {
  it('is sorted by name and matches TOOLSET_NAMES exactly', () => {
    const names = TOOLSETS.map((definition) => definition.name);
    expect(names).toEqual([...TOOLSET_NAMES]);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('marks core as the only always-on toolset', () => {
    const alwaysOn = TOOLSETS.filter((definition) => definition.isAlwaysOn).map(
      (definition) => definition.name,
    );
    expect(alwaysOn).toEqual([CORE_TOOLSET_NAME]);
  });

  it('gives every toolset a non-empty description', () => {
    for (const definition of TOOLSETS) {
      expect(definition.description.length, definition.name).toBeGreaterThan(0);
    }
  });
});
