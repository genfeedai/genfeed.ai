import { API_KEY_SCOPE_PRESETS } from '@genfeedai/contracts/constants';
import { McpResourceConfigurationError } from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { CLIENT_LOGO_SVGS, resolveClientLogo } from '@mcp/mcp/client-logos';
import {
  getMcpProtectedResourceMetadata,
  getMcpServerCard,
  getMcpWwwAuthenticateHeader,
  getPublicMcpResourceMetadataUrl,
  getPublicMcpUrl,
  renderSetupPage,
  resolvePublicMcpResource,
  resolveSetupPageTab,
} from '@mcp/mcp/setup-page';
import { JSDOM } from 'jsdom';

describe('MCP setup page', () => {
  beforeEach(() => {
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', '');
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', '');
    vi.stubEnv('GENFEEDAI_MICROSERVICES_MCP_URL', '');
    vi.stubEnv('GENFEEDAI_PUBLIC_URL', '');
    vi.stubEnv('POSTHOG_HOST', '');
    vi.stubEnv('POSTHOG_PROJECT_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('publishes a discoverable server card for the remote MCP endpoint', () => {
    expect(getMcpServerCard()).toMatchObject({
      name: 'genfeed-mcp-server',
      description: expect.stringContaining('Genfeed'),
      iconUrl: 'https://mcp.genfeed.ai/icons/genfeed-192.png',
      serverInfo: {
        name: 'genfeed-mcp-server',
        title: 'Genfeed',
        websiteUrl: 'https://genfeed.ai',
      },
      transport: {
        endpoint: 'https://mcp.genfeed.ai/mcp',
        type: 'streamable-http',
      },
    });
  });

  it('does not advertise toolsets: every connection lists every tool', () => {
    expect(getMcpServerCard()).not.toHaveProperty('toolsets');
  });

  it('uses the production MCP endpoint by default', () => {
    expect(resolvePublicMcpResource()).toEqual({
      identifier: 'https://mcp.genfeed.ai/mcp',
      sourceKey: null,
    });
    expect(getPublicMcpUrl()).toBe('https://mcp.genfeed.ai/mcp');

    const html = renderSetupPage();
    expect(html).toContain('https://mcp.genfeed.ai/mcp');
    expect(html).toContain('AI agent setup prompt');
    expect(html).toContain('aria-label="Copy agent setup prompt"');
    expect(html).toContain('claude mcp add --transport http genfeed');
    expect(html).toContain('codex mcp add genfeed --url');
    expect(html).toContain('https://app.genfeed.ai/connectors');
    expect(html).toContain('Start guided setup');
    expect(html).toContain('Read MCP docs');
    expect(html).toContain('OAuth setup guide');
    expect(html).toContain('Authorize and verify');
    expect(html).not.toContain('step-title">Manual config');
    expect(html).not.toContain('http://localhost:3014');
    expect(html).toContain('Muse &amp; Grok Bot');
    expect(html).toContain('Other clients');
  });

  it('advertises the shared Genfeed social share card', () => {
    const html = renderSetupPage();

    expect(html).toContain(
      '<meta property="og:image" content="https://genfeed.ai/og/mcp" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://genfeed.ai/og/mcp" />',
    );
    expect(html).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    );
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain(
      '<meta property="og:url" content="https://mcp.genfeed.ai" />',
    );
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

  it('publishes the admin endpoint as its own protected resource', () => {
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai');
    vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', 'https://mcp.genfeed.ai/mcp');

    expect(getMcpProtectedResourceMetadata('admin')).toMatchObject({
      authorization_servers: ['https://api.genfeed.ai'],
      resource: 'https://mcp.genfeed.ai/mcp/admin',
    });
    expect(getPublicMcpResourceMetadataUrl('admin')).toBe(
      'https://mcp.genfeed.ai/.well-known/oauth-protected-resource/mcp/admin',
    );
    expect(getMcpWwwAuthenticateHeader('admin')).toContain(
      'resource_metadata="https://mcp.genfeed.ai/.well-known/oauth-protected-resource/mcp/admin"',
    );
  });

  describe('shared protected-resource identifier (#4553 defect 1)', () => {
    it.each([
      'https://mcp.genfeed.ai/mcp',
      'https://mcp.genfeed.ai',
      'https://mcp.genfeed.ai/',
      'https://mcp.genfeed.ai/mcp/',
    ])(
      'derives one identifier from GENFEEDAI_MCP_PUBLIC_URL=%s on every surface',
      (spelling) => {
        vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai');
        vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', spelling);

        const identifier = 'https://mcp.genfeed.ai/mcp';

        expect(resolvePublicMcpResource()).toEqual({
          identifier,
          sourceKey: 'GENFEEDAI_MCP_PUBLIC_URL',
        });
        expect(getPublicMcpUrl()).toBe(identifier);
        expect(getMcpProtectedResourceMetadata().resource).toBe(identifier);
        expect(getMcpServerCard().transport.endpoint).toBe(identifier);
        expect(getPublicMcpResourceMetadataUrl()).toBe(
          'https://mcp.genfeed.ai/.well-known/oauth-protected-resource',
        );
        expect(getMcpWwwAuthenticateHeader()).toBe(
          `Bearer resource_metadata="https://mcp.genfeed.ai/.well-known/oauth-protected-resource", scope="${API_KEY_SCOPE_PRESETS.mcp.join(' ')}"`,
        );

        const html = renderSetupPage();
        expect(html).toContain(`id="mcp-url">${identifier}<`);
        expect(html).toContain(`data-copy="${identifier}"`);
        expect(html).toContain(`Endpoint: ${identifier}`);
        expect(html).toContain(
          `claude mcp add --transport http genfeed --scope user ${identifier}`,
        );
        expect(html).toContain(`codex mcp add genfeed --url ${identifier}`);
        expect(html).not.toContain(`${identifier}/mcp`);
      },
    );

    it('falls through to GENFEEDAI_MICROSERVICES_MCP_URL when the public URL is unset', () => {
      vi.stubEnv('GENFEEDAI_MICROSERVICES_MCP_URL', 'http://mcp:3014');

      expect(resolvePublicMcpResource()).toEqual({
        identifier: 'http://mcp:3014/mcp',
        sourceKey: 'GENFEEDAI_MICROSERVICES_MCP_URL',
      });
    });

    it.each([
      ['a relative value', 'mcp.genfeed.ai/mcp'],
      ['a malformed value', 'not a url %%'],
      // Concatenated so biome does not misread the scheme token.
      ['a non-http scheme', ['java', 'script:alert(1)'].join('')],
      ['a query string', 'https://mcp.genfeed.ai/mcp?x=1'],
      ['a fragment', 'https://mcp.genfeed.ai/mcp#x'],
    ])(
      'refuses %s in GENFEEDAI_MCP_PUBLIC_URL, naming the variable',
      (_label, value) => {
        vi.stubEnv('GENFEEDAI_MCP_PUBLIC_URL', value);

        expect(() => resolvePublicMcpResource()).toThrow(
          McpResourceConfigurationError,
        );
        expect(() => getPublicMcpUrl()).toThrow(/GENFEEDAI_MCP_PUBLIC_URL/);
        expect(() => getMcpProtectedResourceMetadata()).toThrow(
          /GENFEEDAI_MCP_PUBLIC_URL/,
        );
      },
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
      'Set up the Genfeed MCP server on this machine for the local agent I am using.',
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
      'Guided connection flow: https://app.genfeed.ai/connectors',
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
    expect(promptHtml).toContain(
      'url = &quot;https://mcp.genfeed.ai/mcp&quot;',
    );
    expect(promptHtml).toContain('~/.codex/config.toml');
    expect(promptHtml).not.toContain('gf_live_');
    expect(promptHtml).toContain('genfeed login');
    expect(promptHtml).toContain('Do not paste a secret');
    expect(promptHtml).not.toContain('genfeed keys create');
    expect(promptHtml).toContain('npx skills add genfeedai/agent');
    expect(promptHtml).toContain('read-only get_account and get_brands');
    expect(html).toContain('data-copy-source="skills-install-command"');
    expect(html).toContain('For non-Claude clients only');
    expect(html).toContain(
      'Do not install this skills bundle into any Claude client',
    );
  });

  it('uses shared static UI surface primitives instead of local card CSS', () => {
    const html = renderSetupPage();

    expect(html).toContain('gf-card');
    expect(html).toContain('gf-button gf-button-primary');
    expect(html).toContain('gf-button gf-button-secondary');
    expect(html).toContain('gf-code-block command');
    expect(html).toContain('gf-badge');
    expect(html).toContain('gf-inline-code');
    expect(html).not.toContain('gf-card gf-feature-card');
    expect(html).not.toContain('gf-card gf-info-card');
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
    // `'` survives the WHATWG path percent-encoding the resolver applies, so
    // it is the character that still reaches `escapeHtml` from configuration.
    vi.stubEnv(
      'GENFEEDAI_MCP_PUBLIC_URL',
      "https://preview-mcp.genfeed.ai/o'reilly/mcp",
    );

    const html = renderSetupPage();

    expect(html).toContain(
      'id="mcp-url">https://preview-mcp.genfeed.ai/o&#39;reilly/mcp<',
    );
    expect(html).toContain(
      'data-copy="https://preview-mcp.genfeed.ai/o&#39;reilly/mcp"',
    );
    expect(html).toContain(
      'Endpoint: https://preview-mcp.genfeed.ai/o&#39;reilly/mcp',
    );
    expect(html).not.toContain('data-copy="https://preview-mcp.genfeed.ai/o\'');
  });

  describe('endpoint blocks', () => {
    it('gives the endpoint display, copy button, and command snippets stable ids', () => {
      const html = renderSetupPage();

      expect(html).toContain('id="mcp-url"');
      expect(html).toContain('id="mcp-url-copy"');
      expect(html).toContain('id="claude-code-command"');
      expect(html).toContain('id="codex-command"');
      expect(html).toContain('id="agent-setup-prompt"');
      expect(html).toContain('id="chat-agent-prompt"');
      expect(html).toContain('id="generic-client-config"');
    });

    it('has no toolset picker, profile or toolsets query anywhere on the page', () => {
      const html = renderSetupPage();

      expect(html).not.toContain('toolset');
      expect(html).not.toContain('?profile=');
      expect(html).not.toContain('?toolsets=');
    });

    it('keeps a hostile endpoint path from closing a script element', () => {
      vi.stubEnv(
        'GENFEEDAI_MCP_PUBLIC_URL',
        'https://preview-mcp.genfeed.ai/</script><script>alert(1)</script>/mcp',
      );

      expect(getPublicMcpUrl()).toBe(
        'https://preview-mcp.genfeed.ai/%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E/mcp',
      );
      expect(renderSetupPage()).not.toContain(
        '</script><script>alert(1)</script>',
      );
    });
  });

  describe('Muse & Grok Bot and other MCP clients tabs', () => {
    it('gives Meta Muse and Grok Bot a copy-paste chat prompt that builds their own connector', () => {
      const html = renderSetupPage();

      expect(html).toContain('Muse &amp; Grok Bot');
      expect(html).toContain('id="chat-agent-prompt"');
      expect(html).toContain('data-copy-source="chat-agent-prompt"');
      expect(html).toContain('Add Genfeed as a custom connector.');
      expect(html).toContain('MCP server URL: https://mcp.genfeed.ai/mcp');
      expect(html).toContain(
        'Send me the sign-in link and wait while I approve access in my browser.',
      );
    });

    it('gives other MCP clients (Claude.ai, ChatGPT, Cursor, Gemini) the generic JSON config', () => {
      const html = renderSetupPage();

      expect(html).toContain('Other clients');
      expect(html).toContain('id="generic-client-config"');
      expect(html).toContain('data-copy-source="generic-client-config"');
      expect(html).toContain(
        '&quot;transport&quot;: &quot;streamable-http&quot;',
      );
      expect(html).toContain(
        '&quot;url&quot;: &quot;https://mcp.genfeed.ai/mcp&quot;',
      );
      expect(html).toContain(
        'Add this endpoint as a remote Streamable HTTP server in your client, choose OAuth',
      );
    });
  });

  describe('per-client routes', () => {
    it.each([
      ['/', 'claude-code'],
      ['/docs', 'claude-code'],
      ['/claude-code', 'claude-code'],
      ['/claude-code/', 'claude-code'],
      ['/claude-cowork', 'claude-chat'],
      ['/codex', 'codex'],
      ['/muse-grok-bot', 'chat-agent'],
      ['/other-clients', 'other-clients'],
      ['/agent-prompt', 'agent-prompt'],
    ] as const)('maps %s to the %s tab', (path, tab) => {
      expect(resolveSetupPageTab(path)).toBe(tab);
    });

    it.each(['/nope', '/claude', '/v1/docs', '/mcp'])(
      'does not claim %s',
      (path) => {
        expect(resolveSetupPageTab(path)).toBeNull();
      },
    );

    it('links every tab to its own route', () => {
      const document = new JSDOM(renderSetupPage()).window.document;
      const hrefs = Array.from(document.querySelectorAll('[role="tab"]')).map(
        (tab) => tab.getAttribute('href'),
      );

      expect(hrefs).toEqual([
        '/claude-code',
        '/claude-cowork',
        '/codex',
        '/muse-grok-bot',
        '/other-clients',
        '/agent-prompt',
      ]);
    });

    it('opens the first tab by default', () => {
      const document = new JSDOM(renderSetupPage()).window.document;

      expect(
        document
          .querySelector('[role="tab"][aria-selected="true"]')
          ?.getAttribute('data-tab'),
      ).toBe('claude-code');
      expect(
        document.querySelector('.tabpanel.is-active')?.getAttribute('id'),
      ).toBe('panel-claude-code');
      expect(document.title).toBe('Genfeed MCP Server — connect any AI agent');
    });

    it('keeps every tab link focusable and the default title consistent without JavaScript', () => {
      const document = new JSDOM(renderSetupPage()).window.document;
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));

      expect(tabs.some((tab) => tab.hasAttribute('tabindex'))).toBe(false);
      expect(
        document.querySelector('#tab-claude-code')?.getAttribute('data-title'),
      ).toBe(document.title);
    });

    it('opens the requested tab and names it in the title and share URL', () => {
      const html = renderSetupPage('codex');
      const document = new JSDOM(html).window.document;

      expect(
        document
          .querySelector('[role="tab"][aria-selected="true"]')
          ?.getAttribute('data-tab'),
      ).toBe('codex');
      expect(
        Array.from(document.querySelectorAll('.tabpanel.is-active')).map(
          (panel) => panel.getAttribute('id'),
        ),
      ).toEqual(['panel-codex']);
      const panel = document.getElementById('panel-codex');
      expect(panel?.textContent).toContain('127.0.0.1 (localhost)');
      expect(panel?.textContent).toContain(
        'Return to Codex and ask it to list your Genfeed brands.',
      );
      expect(document.title).toBe('Codex setup — Genfeed MCP Server');
      expect(html).toContain(
        '<meta property="og:url" content="https://mcp.genfeed.ai/codex" />',
      );
    });

    it('points every Claude client at the full-access MCP URL, never the directory endpoint', () => {
      const dom = new JSDOM(renderSetupPage());
      const text = (id: string): string =>
        dom.window.document.getElementById(id)?.textContent ?? '';

      expect(text('claude-code-command')).toBe(
        'claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp',
      );
      expect(text('claude-chat-url')).toBe('https://mcp.genfeed.ai/mcp');
      expect(
        dom.window.document.getElementById('claude-code-media-command'),
      ).toBeNull();
      expect(
        dom.window.document.getElementById('claude-chat-media-url'),
      ).toBeNull();
      expect(dom.window.document.documentElement.outerHTML).not.toMatch(
        /\/mcp\/claude|plugin install genfeed/,
      );
      expect(dom.window.document.body.textContent).not.toContain(
        'Genfeed Studio',
      );
      dom.window.close();
    });

    it('keeps Claude Code and Claude & Cowork as separate tabs', () => {
      const document = new JSDOM(renderSetupPage()).window.document;

      expect(document.getElementById('panel-claude-code')).not.toBeNull();
      expect(document.getElementById('panel-claude-chat')).not.toBeNull();
    });

    it('serves official client marks from the MCP origin', () => {
      const html = renderSetupPage();

      for (const logo of Object.keys(CLIENT_LOGO_SVGS)) {
        expect(html).toContain(`src="/assets/clients/${logo}.svg"`);
        expect(resolveClientLogo(`/assets/clients/${logo}.svg`)).toContain(
          '<svg',
        );
      }
      expect(resolveClientLogo('/assets/clients/unknown.svg')).toBeNull();
      expect(resolveClientLogo('/assets/clients/toString.svg')).toBeNull();
    });
  });
});
