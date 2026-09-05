import {
  getMcpProtectedResourceMetadata,
  getMcpServerCard,
  getMcpWwwAuthenticateHeader,
  getPublicMcpResourceMetadataUrl,
  getPublicMcpUrl,
  renderSetupPage,
} from '@mcp/mcp/setup-page';

describe('MCP setup page', () => {
  beforeEach(() => {
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', '');
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', '');
    vi.stubEnv('POSTHOG_HOST', '');
    vi.stubEnv('POSTHOG_PROJECT_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes a discoverable server card for the remote MCP endpoint', () => {
    expect(getMcpServerCard()).toMatchObject({
      name: 'genfeed-mcp-server',
      serverInfo: {
        name: 'genfeed-mcp-server',
        title: 'Genfeed MCP Server',
      },
      transport: {
        endpoint: 'https://mcp.genfeed.ai/mcp',
        type: 'streamable-http',
      },
    });
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
    expect(html).toContain('OAuth setup guide');
    expect(html).not.toContain('http://localhost:3014');
  });

  it('adds cookieless page and control tracking when PostHog is configured', () => {
    vi.stubEnv('POSTHOG_PROJECT_API_KEY', 'phc_test123');

    const html = renderSetupPage();

    expect(html).toContain('posthog.init("phc_test123"');
    expect(html).toContain('cookieless_mode: "always"');
    expect(html).toContain('element_allowlist: ["a", "button"]');
    expect(html).toContain('disable_session_recording: true');
    expect(html).toContain('person_profiles: "never"');
  });

  it('uses the configured PostHog host in the browser snippet', () => {
    vi.stubEnv('POSTHOG_PROJECT_API_KEY', 'phc_test123');
    vi.stubEnv('POSTHOG_HOST', 'https://posthog.example.com');

    const html = renderSetupPage();

    expect(html).toContain('api_host: "https://posthog.example.com"');
    expect(html).not.toContain('api_host: "https://eu.i.posthog.com"');
  });

  it('omits analytics for missing or malformed project tokens', () => {
    expect(renderSetupPage()).not.toContain('posthog.init(');

    vi.stubEnv(
      'POSTHOG_PROJECT_API_KEY',
      'phc_bad</script><script>alert(1)</script>',
    );
    expect(renderSetupPage()).not.toContain('posthog.init(');
    expect(renderSetupPage()).not.toContain('alert(1)');
  });

  it('publishes consistent protected-resource metadata and challenge headers', () => {
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai');
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', 'https://mcp.genfeed.ai/mcp');

    expect(getMcpProtectedResourceMetadata()).toMatchObject({
      authorization_servers: ['https://api.genfeed.ai'],
      bearer_methods_supported: ['header'],
      resource: 'https://mcp.genfeed.ai/mcp',
    });
    expect(getPublicMcpResourceMetadataUrl()).toBe(
      'https://mcp.genfeed.ai/.well-known/oauth-protected-resource',
    );
    expect(getMcpWwwAuthenticateHeader()).toContain(
      'resource_metadata="https://mcp.genfeed.ai/.well-known/oauth-protected-resource"',
    );
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
    expect(promptHtml).toContain(
      'Authentication: browser OAuth (no API key required)',
    );
    expect(promptHtml).not.toContain('GENFEED_API_KEY');
    expect(promptHtml).not.toContain('--header');
    expect(promptHtml).toContain('codex mcp login genfeed');
    expect(promptHtml).toContain('list my Genfeed brands');
    expect(html).toContain('/api-reference/mcp#connect-via-oauth');
    expect(promptHtml).toContain(
      'Guided connection flow: https://app.genfeed.ai/connect',
    );
    expect(promptHtml).toContain(
      'Never request tokens or passwords in this chat',
    );
    expect(promptHtml).toContain(
      'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
    );
    expect(promptHtml).toContain(
      'codex mcp add genfeed --url https://mcp.genfeed.ai/mcp',
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

  it('follows the operating system color scheme without dark-only overrides', () => {
    const html = renderSetupPage();

    expect(html).toContain('color-scheme: light dark');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('background: var(--gf-bg-primary)');
    expect(html).not.toContain(':root {\n  color-scheme: dark;');
    expect(html).not.toContain('background: #050607');
    expect(html).not.toContain('rgba(255,255,255,0.06)');
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
