import {
  CORE_APP_IDS,
  NATIVE_SECONDARY_APP_IDS,
} from '@genfeedai/contracts/constants/native-apps.constant';
import { describe, expect, it } from 'vitest';
import {
  isMcpAppName,
  MCP_APP_NAMES,
  MCP_APP_TOOLSETS,
  resolveMcpAppToolsets,
} from './app-toolsets';
import { getToolsForToolsets, TOOLSET_NAMES } from './toolsets';

/**
 * Toolsets with MCP tools that no app opens. They stay reachable by name with
 * `?toolsets=`; adding a toolset forces a decision here.
 */
const TOOLSETS_WITHOUT_APP = [
  'brand',
  'engagement',
  'knowledge',
  'skills-pro',
] as const;

describe('MCP app toolsets', () => {
  it('maps every core and native secondary app', () => {
    expect([...MCP_APP_NAMES].sort()).toEqual(
      [...CORE_APP_IDS, ...NATIVE_SECONDARY_APP_IDS].sort(),
    );
  });

  it('only names toolsets that exist', () => {
    for (const toolsets of Object.values(MCP_APP_TOOLSETS)) {
      for (const toolset of toolsets) {
        expect(TOOLSET_NAMES).toContain(toolset);
      }
    }
  });

  it('opens at least one MCP tool beyond core for every app except workspace', () => {
    const coreNames = new Set(
      getToolsForToolsets('mcp', ['core']).map((tool) => tool.name),
    );
    for (const app of MCP_APP_NAMES) {
      const toolsets = resolveMcpAppToolsets([app]);
      if (app === 'workspace') {
        // An empty list would select the whole catalog, so assert it directly.
        expect(toolsets).toEqual([]);
        continue;
      }
      const beyondCore = getToolsForToolsets('mcp', toolsets).filter(
        (tool) => !coreNames.has(tool.name),
      );
      expect(beyondCore.length, app).toBeGreaterThan(0);
    }
  });

  it('leaves only the listed toolsets without an app', () => {
    const covered = new Set(Object.values(MCP_APP_TOOLSETS).flat());
    const toolsCoreNames = new Set(
      getToolsForToolsets('mcp', ['core']).map((tool) => tool.name),
    );
    const uncovered = TOOLSET_NAMES.filter(
      (toolset) =>
        toolset !== 'core' &&
        !covered.has(toolset) &&
        getToolsForToolsets('mcp', [toolset]).some(
          (tool) => !toolsCoreNames.has(tool.name),
        ),
    );
    expect(uncovered).toEqual([...TOOLSETS_WITHOUT_APP]);
  });

  it('unions the toolsets of several apps without duplicates', () => {
    expect(resolveMcpAppToolsets(['clipper', 'editor', 'motion'])).toEqual([
      'clipper',
      'visual-code',
    ]);
  });

  it('recognizes app names', () => {
    expect(isMcpAppName('clipper')).toBe(true);
    expect(isMcpAppName('studio')).toBe(false);
  });
});
