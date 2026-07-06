import { getToolsForSurface, toMcpTools } from '@genfeedai/tools';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Integration guard against the boot-time drift the platform-hardening series
 * added (`ToolRegistryService.validateDispatchCoverage`): every tool on the real
 * `@genfeedai/tools` mcp surface — including the OpenAPI-generated tools
 * (#1248) — must classify to a concrete executor, never `unknown`. If this
 * fails, the MCP server would crash on boot. Deliberately does NOT mock
 * `@genfeedai/tools`, so it exercises the actual registry.
 */

describe('MCP surface dispatch coverage (real registry)', () => {
  const mcpTools = toMcpTools(getToolsForSurface('mcp'));

  it('includes the generated tool baseline', () => {
    const generated = mcpTools.filter((tool) => tool.name.includes('__'));
    expect(generated.length).toBeGreaterThan(1000);
  });

  it('classifies every surfaced tool to a real executor', () => {
    const unroutable = mcpTools
      .map((tool) => tool.name)
      // resolve_approval is handled before classify-dispatch (see the guard).
      .filter((name) => name !== 'resolve_approval')
      .filter((name) => ToolRegistryService.classify(name) === 'unknown');

    expect(unroutable).toEqual([]);
  });

  it('routes generated tools to the generated executor kind', () => {
    const generated = mcpTools.find((tool) => tool.name.includes('__'));
    expect(generated).toBeDefined();
    expect(ToolRegistryService.classify(generated?.name ?? '')).toBe(
      'generated',
    );
  });
});
