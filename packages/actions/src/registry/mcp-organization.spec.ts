import { describe, expect, it } from 'vitest';
import { toMcpTools } from '../adapters/to-mcp-tool';
import { MCP_ORGANIZATION_ARGUMENT } from './mcp-organization';
import { getToolsForSurface } from './tool-registry';

describe('organization argument', () => {
  it('is declared as an optional string on every listed MCP tool', () => {
    const tools = toMcpTools(getToolsForSurface('mcp'));
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(
        tool.inputSchema.properties[MCP_ORGANIZATION_ARGUMENT],
        tool.name,
      ).toMatchObject({ type: 'string' });
      expect(tool.inputSchema.required ?? [], tool.name).not.toContain(
        MCP_ORGANIZATION_ARGUMENT,
      );
    }
  });

  it('is retired as a tool of its own: no switch_org and no switch_organization action', () => {
    const names = getToolsForSurface('mcp').map((tool) => tool.name);
    expect(names).not.toContain('switch_org');
    const workspace = toMcpTools(getToolsForSurface('mcp')).find(
      (tool) => tool.name === 'manage_workspace',
    );
    expect(JSON.stringify(workspace)).not.toContain('switch_org');
  });
});
