import {
  CURATED_ACTION_CATALOG,
  getToolsForSurface,
  isActionOnSurface,
} from '@genfeedai/actions';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';
import { describe, expect, it } from 'vitest';

const LEGACY_MCP_ALIASES = new Set([
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
    const expected = eligible.filter((name) => !LEGACY_MCP_ALIASES.has(name));
    const actual = getToolsForSurface('mcp').map((tool) => tool.name);

    expect(eligible).toHaveLength(147);
    expect(actual).toHaveLength(143);
    expect(
      eligible.filter((name) => LEGACY_MCP_ALIASES.has(name)).sort(),
    ).toEqual([...LEGACY_MCP_ALIASES].sort());
    for (const alias of LEGACY_MCP_ALIASES) expect(actual).not.toContain(alias);
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
