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
    expect(html).toContain('AI agent setup prompt');
    expect(html).toContain('Copy AI prompt');
    expect(html).toContain('claude mcp add --transport http genfeed');
    expect(html).toContain('codex mcp add genfeed --url');
    expect(html).toContain('https://app.genfeed.ai/connect');
    expect(html).toContain('Start guided setup');
    expect(html).not.toContain('http://localhost:3014');
  });

  it('renders a copyable agent prompt that configures MCP without embedding a key', () => {
    const html = renderSetupPage();
    const promptStart = html.indexOf('id="agent-setup-prompt"');
    const promptEnd = html.indexOf('</code></pre>', promptStart);
    const promptHtml = html.slice(promptStart, promptEnd);

    expect(html).toContain('id="agent-setup-prompt"');
    expect(html).toContain('data-copy-source="agent-setup-prompt"');
    expect(promptHtml).toContain(
      'Set up the Genfeed MCP server on this machine.',
    );
    expect(promptHtml).toContain('Authentication env var: GENFEED_API_KEY');
    expect(promptHtml).toContain(
      'Guided connection flow: https://app.genfeed.ai/connect',
    );
    expect(promptHtml).toContain(
      'Do not request or paste the key into source-controlled files',
    );
    expect(promptHtml).toContain(
      'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
    );
    expect(promptHtml).toContain(
      'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp --bearer-token-env-var GENFEED_API_KEY',
    );
    expect(promptHtml).toContain('~/.codex/config.toml');
    expect(promptHtml).not.toContain('gf_live_');
  });

  it('uses shared static UI surface primitives instead of local card CSS', () => {
    const html = renderSetupPage();

    expect(html).toContain('gf-card gf-feature-card');
    expect(html).toContain('gf-card gf-info-card');
    expect(html).toContain('gf-button gf-button-primary');
    expect(html).toContain('gf-code-block command');
    expect(html).not.toContain('mcp-hero-card');
    expect(html).not.toContain('mcp-meta-card');
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
    expect(html).toContain(
      'Endpoint: https://preview-mcp.genfeed.ai/mcp?x=&lt;script&gt;',
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
