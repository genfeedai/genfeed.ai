import {
  CURATED_ACTION_CATALOG,
  getMcpCatalogOperations,
  getRetiredMcpCatalogTool,
  getToolsForSurface,
  isActionOnSurface,
  isMcpCatalogToolName,
  MCP_CATALOG_TOOL_NAMES,
} from '@genfeedai/actions';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { describe, expect, it } from 'vitest';

const eligible = CURATED_ACTION_CATALOG.filter((entry) =>
  isActionOnSurface(entry, 'mcp'),
).map((entry) => entry.name);
// The tools a merged tool runs are eligible for MCP but are not listed.
const unlisted = eligible.filter(
  (name) => getRetiredMcpCatalogTool(name) !== undefined,
);

describe('curated MCP action catalog', () => {
  it('lists exactly the actions reviewed for MCP', () => {
    const expected = eligible.filter((name) => !unlisted.includes(name));
    const actual = getToolsForSurface('mcp').map((tool) => tool.name);

    expect(unlisted.length).toBeGreaterThan(0);
    for (const name of unlisted) expect(actual).not.toContain(name);
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it('lists every merged tool and keeps what it runs eligible for MCP', () => {
    for (const name of MCP_CATALOG_TOOL_NAMES) {
      expect(eligible).toContain(name);
      for (const operation of getMcpCatalogOperations(name))
        expect(eligible).toContain(operation.executionName);
    }
  });

  it('routes every MCP action to a concrete executor', () => {
    const unroutable = eligible
      .filter(
        (name) => name !== 'resolve_approval' && name !== 'answer_approval',
      )
      .filter((name) => !isMcpCatalogToolName(name))
      .filter((name) => ToolRegistryService.classify(name) === 'unknown');

    expect(unroutable).toEqual([]);
    expect(() => ToolRegistryService.validateDispatchCoverage()).not.toThrow();
  });

  it('does not classify generated endpoint names as tools', () => {
    expect(ToolRegistryService.classify('brands__create')).toBe('unknown');
  });
});
