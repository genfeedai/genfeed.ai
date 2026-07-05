import { getToolsForSurface, isGeneratedApiTool } from '@genfeedai/tools';
import { ToolRegistryService } from '@mcp/services/tool-registry.service';

/**
 * Boot-safety guard against the REAL registry (no `@genfeedai/tools` mock).
 *
 * The `onModuleInit` drift guard crashes the MCP server if any MCP-surfaced tool
 * fails to classify. After #1246 wired ~1165 OpenAPI-generated tools onto the
 * `mcp` surface, this proves every one of them (plus the curated set) routes to
 * a real executor — i.e. the server actually boots. If this fails, the deploy's
 * health check would go red.
 */
describe('ToolRegistryService boot coverage (real registry)', () => {
  it('classifies every MCP-surfaced tool, including all generated ones', () => {
    expect(() => ToolRegistryService.validateDispatchCoverage()).not.toThrow();
  });

  it('routes every generated tool to the openapi-generic executor', () => {
    const generated = getToolsForSurface('mcp').filter((tool) =>
      isGeneratedApiTool(tool.name),
    );
    // Sanity: generation actually populated the surface.
    expect(generated.length).toBeGreaterThan(500);
    for (const tool of generated) {
      expect(ToolRegistryService.classify(tool.name)).toBe('openapi-generic');
    }
  });
});
