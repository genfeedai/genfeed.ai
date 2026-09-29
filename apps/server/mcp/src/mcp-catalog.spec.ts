import {
  CURATED_ACTION_CATALOG,
  getToolsForSurface,
  isActionOnSurface,
} from '@genfeedai/actions';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { describe, expect, it } from 'vitest';

describe('curated MCP action catalog', () => {
  it('lists exactly the actions reviewed for MCP', () => {
    const expected = CURATED_ACTION_CATALOG.filter((entry) =>
      isActionOnSurface(entry, 'mcp'),
    ).map((entry) => entry.name);
    const actual = getToolsForSurface('mcp').map((tool) => tool.name);

    expect(actual).toEqual(expected);
  });

  it('routes every MCP action to a concrete executor', () => {
    const unroutable = getToolsForSurface('mcp')
      .map((tool) => tool.name)
      .filter((name) => name !== 'resolve_approval')
      .filter((name) => ToolRegistryService.classify(name) === 'unknown');

    expect(unroutable).toEqual([]);
    expect(() => ToolRegistryService.validateDispatchCoverage()).not.toThrow();
  });
});
