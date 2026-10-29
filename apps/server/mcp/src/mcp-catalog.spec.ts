import {
  CURATED_ACTION_CATALOG,
  getToolsForSurface,
  isActionOnSurface,
} from '@genfeedai/actions';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { describe, expect, it } from 'vitest';

const RETIRED_MCP_TOOL_NAMES = new Set([
  'get_scheduler_capabilities',
  'validate_scheduler_target',
  'request_media_upload',
  'complete_media_upload',
]);
const eligible = CURATED_ACTION_CATALOG.filter((entry) =>
  isActionOnSurface(entry, 'mcp'),
).map((entry) => entry.name);

describe('curated MCP action catalog', () => {
  it('lists exactly the actions reviewed for MCP', () => {
    const expected = eligible.filter(
      (name) => !RETIRED_MCP_TOOL_NAMES.has(name),
    );
    const actual = getToolsForSurface('mcp').map((tool) => tool.name);

    expect(eligible).toHaveLength(155);
    expect(actual).toHaveLength(151);
    expect(
      eligible.filter((name) => RETIRED_MCP_TOOL_NAMES.has(name)).sort(),
    ).toEqual([...RETIRED_MCP_TOOL_NAMES].sort());
    for (const retiredName of RETIRED_MCP_TOOL_NAMES)
      expect(actual).not.toContain(retiredName);
    expect(actual).toEqual(expected);
  });

  it('routes every MCP action to a concrete executor', () => {
    const unroutable = eligible
      .filter((name) => name !== 'resolve_approval')
      .filter((name) => ToolRegistryService.classify(name) === 'unknown');

    expect(unroutable).toEqual([]);
    expect(() => ToolRegistryService.validateDispatchCoverage()).not.toThrow();
  });

  it('does not classify generated endpoint names as tools', () => {
    expect(ToolRegistryService.classify('brands__create')).toBe('unknown');
  });
});
