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

  it('uses shared static UI surface primitives instead of local card CSS', () => {
    const html = renderSetupPage();

    expect(html).toContain('gf-card mcp-hero-card');
    expect(html).toContain('gf-button gf-button-primary');
    expect(html).toContain('gf-code-block command');
    expect(html).not.toContain('class="poster"');
    expect(html).not.toContain('class="client-shell"');
    expect(html).not.toContain('class="meta-card"');
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

  it('falls back to the default when override scheme is not http/https', () => {
    // Concatenate to prevent biome from misinterpreting the scheme token.
    const dangerousScheme = ['java', 'script:alert(1)'].join('');
    vi.stubEnv('GENFEED_MCP_RESOURCE_URL', dangerousScheme);

    expect(getPublicMcpUrl()).toBe('https://mcp.genfeed.ai/mcp');

    const html = renderSetupPage();
    expect(html).toContain('https://mcp.genfeed.ai/mcp');
    expect(html).not.toContain(dangerousScheme);
  });

  it('falls back to the default URL when override is malformed', () => {
    vi.stubEnv('GENFEED_MCP_RESOURCE_URL', 'not a url %%');

    expect(getPublicMcpUrl()).toBe('https://mcp.genfeed.ai/mcp');
  });
});
