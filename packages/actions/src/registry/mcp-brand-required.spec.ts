import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../adapters/to-mcp-tool';
import {
  describeMissingMcpBrand,
  isMcpBrandRequiredTool,
  isMcpBrandRequiredWhenMultipleTool,
  MCP_BRAND_REQUIRED_TOOL_NAMES,
  MCP_BRAND_REQUIRED_WHEN_MULTIPLE_TOOL_NAMES,
  readMcpBrandId,
  withRequiredMcpBrandId,
} from './mcp-brand-required';
import { getRetiredMcpCatalogTool } from './mcp-catalog-calls';
import { getToolByName, getToolsForSurface } from './tool-registry';

describe('MCP brand-required generation tools', () => {
  it('names only tools that exist on the MCP surface', () => {
    const mcpNames = new Set<string>(
      getToolsForSurface('mcp').map((tool) => tool.name),
    );
    for (const name of MCP_BRAND_REQUIRED_TOOL_NAMES) {
      // A merged tool runs the original, which keeps its MCP surface unlisted.
      expect(
        mcpNames.has(name) || getToolByName(name)?.surfaces.mcp === true,
        name,
      ).toBe(true);
    }
  });

  it('requires brandId in the MCP input schema of every listed tool', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    // A retired tool is called through its merged tool, so the call checks
    // brandId after the action resolves; only a listed tool shows it required.
    for (const name of [...MCP_BRAND_REQUIRED_TOOL_NAMES].filter(
      (candidate) => getRetiredMcpCatalogTool(candidate) === undefined,
    )) {
      const tool = tools.find((candidate) => candidate.name === name);
      expect(tool?.inputSchema.required, name).toContain('brandId');
      expect(tool?.inputSchema.properties.brandId, name).toMatchObject({
        type: 'string',
      });
      expect(tool?.description, name).toContain(
        'call get_context(action=brands) first',
      );
    }
  });

  it('leaves the canonical definition and other tools untouched', () => {
    const canonical = getToolsForSurface('mcp');
    const generate = getToolByName('generate');
    expect(generate?.parameters.required ?? []).not.toContain('brandId');
    const other = toMcpTools(canonical).find(
      (tool) => tool.name === 'get_brands',
    );
    expect(other?.inputSchema.required ?? []).not.toContain('brandId');
    expect(isMcpBrandRequiredTool('get_brands')).toBe(false);
  });

  it('adds brandId without duplicating an existing required entry', () => {
    const schema = withRequiredMcpBrandId({
      properties: { brandId: { type: 'string' }, prompt: { type: 'string' } },
      required: ['prompt', 'brandId'],
      type: 'object',
    });
    expect(schema.required).toEqual(['prompt', 'brandId']);
    const created = withRequiredMcpBrandId({
      properties: {},
      type: 'object',
    });
    expect(created.required).toEqual(['brandId']);
    expect(created.properties.brandId).toMatchObject({ type: 'string' });
  });

  it('reads only a non-blank string brandId', () => {
    expect(readMcpBrandId({ brandId: ' b1 ' })).toBe('b1');
    expect(readMcpBrandId({ brandId: '  ' })).toBeUndefined();
    expect(readMcpBrandId({ brandId: 4 })).toBeUndefined();
    expect(readMcpBrandId(undefined)).toBeUndefined();
  });

  it('keeps the multiple-brand rule apart from the always-required generation set', () => {
    expect([...MCP_BRAND_REQUIRED_WHEN_MULTIPLE_TOOL_NAMES]).toEqual([
      'create_article_draft',
      'create_post',
      'request_media_upload',
    ]);
    expect(isMcpBrandRequiredWhenMultipleTool('create_post')).toBe(true);
    expect(isMcpBrandRequiredTool('create_post')).toBe(false);
    expect(MCP_BRAND_REQUIRED_TOOL_NAMES.has('create_post')).toBe(false);
  });

  it('lists the caller brands in the rejection message', () => {
    const message = describeMissingMcpBrand('generate', [
      { id: 'b1', label: 'Acme' },
      { id: 'b2', label: 'Beta' },
    ]);
    expect(message).toContain('generate requires brandId');
    expect(message).toContain('Acme (b1); Beta (b2)');
    expect(describeMissingMcpBrand('generate', [])).toContain(
      'setup_brand(action=onboard)',
    );
  });
});
