import { getPublicMcpUrl, renderSetupPage } from '@mcp/mcp/setup-page';

describe('MCP setup page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the production MCP endpoint by default', () => {
    vi.stubEnv('GENFEED_MCP_RESOURCE_URL', '');

    expect(getPublicMcpUrl()).toBe('https://mcp.genfeed.ai/mcp');

    const html = renderSetupPage();
    expect(html).toContain('https://mcp.genfeed.ai/mcp');
    expect(html).toContain('claude mcp add --transport http genfeed');
    expect(html).toContain('codex mcp add genfeed --url');
    expect(html).not.toContain('http://localhost:3014');
  });

  it('escapes an overridden endpoint before rendering it into HTML', () => {
    vi.stubEnv(
      'GENFEED_MCP_RESOURCE_URL',
      'https://preview-mcp.genfeed.ai/mcp?x=<script>',
    );

    const html = renderSetupPage();

    expect(html).toContain(
      'https://preview-mcp.genfeed.ai/mcp?x=&lt;script&gt;',
    );
    expect(html).not.toContain('x=<script>');
  });
});
