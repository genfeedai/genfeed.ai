import { describe, expect, it } from 'vitest';
import { ALL_TOOLS, getToolsForSurface } from '../tool-registry';
import {
  PROVIDER_FREE_TOOLS,
  PROVIDER_PAID_TOOLS,
  toolDataSource,
} from './tool-data-sources';

describe('tool data sources', () => {
  it('names every paid provider read fetch_* and nothing else', () => {
    const fetchTools = ALL_TOOLS.filter((tool) =>
      tool.name.startsWith('fetch_'),
    );

    expect(fetchTools.map((tool) => tool.name).sort()).toEqual(
      [...PROVIDER_PAID_TOOLS].sort(),
    );
    for (const tool of fetchTools) {
      expect(tool.dataSource, tool.name).toBe('provider-paid');
    }
  });

  it('only lists tools that exist, once', () => {
    const names = new Set(ALL_TOOLS.map((tool) => tool.name));

    for (const name of [...PROVIDER_PAID_TOOLS, ...PROVIDER_FREE_TOOLS]) {
      expect(names.has(name), name).toBe(true);
    }
    for (const name of PROVIDER_PAID_TOOLS) {
      expect(PROVIDER_FREE_TOOLS.has(name), name).toBe(false);
    }
  });

  it('keeps the prompt on paid reads and drops it for free and stored reads', () => {
    for (const tool of getToolsForSurface('mcp')) {
      const source = toolDataSource(tool.name);
      expect(tool.dataSource, tool.name).toBe(source);
      if (source === 'provider-paid') {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(false);
        expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
      }
      if (source === 'provider') {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
        expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
      }
    }
  });

  it('gives every paid provider read a direct mutation policy', () => {
    for (const name of PROVIDER_PAID_TOOLS) {
      expect(ALL_TOOLS.find((tool) => tool.name === name)?.mutationPolicy).toBe(
        'direct',
      );
    }
  });
});
