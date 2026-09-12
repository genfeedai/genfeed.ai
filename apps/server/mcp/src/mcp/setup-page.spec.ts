import { getToolsets } from '@genfeedai/actions';
import {
  getMcpProtectedResourceMetadata,
  getMcpServerCard,
  getMcpWwwAuthenticateHeader,
  getPublicMcpResourceMetadataUrl,
  getPublicMcpUrl,
  renderSetupPage,
} from '@mcp/mcp/setup-page';

/**
 * Extracts a `function <name>(...) { ... }` declaration's exact source text
 * out of the rendered HTML's inline `<script>` block, by brace-matching from
 * the first `{` after the signature. Used to unit-test the picker's client
 * JS logic directly (no jsdom in this package's vitest environment) rather
 * than asserting on the JS source text as a string.
 */
function extractFunctionSource(html: string, name: string): string {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) {
    throw new Error(`function ${name} not found in rendered HTML`);
  }
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error(`unbalanced braces for function ${name}`);
  }
  return html.slice(start, end + 1);
}

/**
 * Loads one or more extracted function declarations into a fresh function
 * scope (so a target function can call sibling helpers it depends on, e.g.
 * `rewriteAgentPrompt` calling `replaceAll`) and returns the last-named one,
 * callable exactly as the browser would call it.
 */
function loadPickerFunction<T extends (...args: never[]) => unknown>(
  html: string,
  ...names: string[]
): T {
  const sources = names.map((name) => extractFunctionSource(html, name));
  const targetName = names[names.length - 1];
  // Extracting real client-side source for a direct behavioral test; no
  // jsdom is configured for this package's vitest environment.
  return new Function(`${sources.join('\n')}\nreturn ${targetName};`)() as T;
}

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

  it('lists the mcp-surfaced toolsets on the server card, core included', () => {
    const card = getMcpServerCard();

    expect(Array.isArray(card.toolsets)).toBe(true);
    expect(card.toolsets.length).toBeGreaterThan(0);
    expect(card.toolsets).toContainEqual(
      expect.objectContaining({ name: 'core' }),
    );
    for (const toolset of card.toolsets) {
      expect(toolset).toEqual(
        expect.objectContaining({
          description: expect.any(String),
          name: expect.any(String),
          toolCount: expect.any(Number),
        }),
      );
    }
  });

  it('counts only user-visible tools per toolset on the public server card', () => {
    // The card is unauthenticated/public, so `core`'s count must exclude the
    // superadmin-gated `resolve_approval` tool — a plain user never sees it.
    // Comparing against the unfiltered catalog count (rather than a magic
    // number) proves the role filter is actually doing something, without
    // hard-coding the current size of the core toolset.
    const unfilteredCoreCount = getToolsets('mcp').find(
      (toolset) => toolset.name === 'core',
    )?.toolCount;
    const card = getMcpServerCard();
    const core = card.toolsets.find((toolset) => toolset.name === 'core');

    expect(core).toBeDefined();
    expect(unfilteredCoreCount).toBeDefined();
    expect(core?.toolCount).toBeLessThan(unfilteredCoreCount as number);
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
    expect(html).toContain('Authorize and verify');
    expect(html).not.toContain('step-title">Manual config');
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

  it('escapes U+2028/U+2029 line/paragraph separators in the inline script string literal', () => {
    vi.stubEnv(
      'GENFEED_MCP_RESOURCE_URL',
      'https://preview-mcp.genfeed.ai/mcp?x=  ',
    );

    const html = renderSetupPage();
    const baseMcpUrlStart = html.indexOf('var baseMcpUrl = ');
    const baseMcpUrlEnd = html.indexOf(';', baseMcpUrlStart);
    const baseMcpUrlStatement = html.slice(baseMcpUrlStart, baseMcpUrlEnd);

    // Both characters must be escaped specifically where the endpoint is
    // embedded as a JS string literal for the picker script -- a raw one
    // left in that script source is a line terminator to some tooling or
    // older engines. Elsewhere on the page (the visible Endpoint text, the
    // agent prompt) the raw characters are harmless HTML text content and
    // are expected to still appear, so the assertion is scoped to the JS
    // string literal statement rather than the whole page.
    expect(baseMcpUrlStatement).toContain('\\u2028');
    expect(baseMcpUrlStatement).toContain('\\u2029');
    expect(baseMcpUrlStatement).not.toContain('mcp?x=  ');
  });

  describe('toolset picker', () => {
    it('renders a checkbox per mcp-surfaced toolset, core checked and disabled', () => {
      const html = renderSetupPage();

      expect(html).toContain(
        'data-toolset-checkbox data-toolset="core" checked disabled',
      );
      expect(html).toContain('toolset-picker');
      // A second, non-core toolset must be selectable (not disabled).
      expect(html).toMatch(
        /data-toolset-checkbox data-toolset="(?!core")[a-z-]+"(?! checked disabled)/,
      );
    });

    it('shows the same user-visible core tool count as the JSON server card, not the unfiltered catalog count', () => {
      // The picker and the server card must agree: both are public/unauthenticated
      // surfaces, so `core`'s displayed count excludes role-gated tools like
      // `resolve_approval` on both, rather than the picker showing the raw
      // catalog count while the card shows the role-filtered one.
      const html = renderSetupPage();
      const unfilteredCoreCount = getToolsets('mcp').find(
        (toolset) => toolset.name === 'core',
      )?.toolCount;
      const cardCoreCount = getMcpServerCard().toolsets.find(
        (toolset) => toolset.name === 'core',
      )?.toolCount;

      const coreOptionMatch = html.match(
        /data-toolset-checkbox data-toolset="core" checked disabled[\s\S]*?toolset-count">(\d+) tools?</,
      );

      expect(unfilteredCoreCount).toBeDefined();
      expect(cardCoreCount).toBeDefined();
      expect(coreOptionMatch).not.toBeNull();

      const pickerCoreCount = Number(coreOptionMatch?.[1]);
      expect(pickerCoreCount).toBe(cardCoreCount);
      expect(pickerCoreCount).toBeLessThan(unfilteredCoreCount as number);
    });

    it('gives the endpoint display, copy button, and command snippets stable ids for the picker script', () => {
      const html = renderSetupPage();

      expect(html).toContain('id="mcp-url"');
      expect(html).toContain('id="mcp-url-copy"');
      expect(html).toContain('id="claude-code-command"');
      expect(html).toContain('id="codex-command"');
      expect(html).toContain('id="agent-setup-prompt"');
    });

    it('joins the toolsets query with "&" when the base URL already has a query string', () => {
      const html = renderSetupPage();
      const joinToolsetsUrl = loadPickerFunction<
        (baseUrl: string, selected: string[]) => string
      >(html, 'joinToolsetsUrl');

      expect(
        joinToolsetsUrl('https://mcp.genfeed.ai/mcp?x=1', ['content']),
      ).toBe('https://mcp.genfeed.ai/mcp?x=1&toolsets=content');
      expect(
        joinToolsetsUrl('https://mcp.genfeed.ai/mcp?x=1', [
          'content',
          'generation',
        ]),
      ).toBe('https://mcp.genfeed.ai/mcp?x=1&toolsets=content,generation');
    });

    it('joins the toolsets query with "?" (and leaves the URL alone for an empty selection)', () => {
      const html = renderSetupPage();
      const joinToolsetsUrl = loadPickerFunction<
        (baseUrl: string, selected: string[]) => string
      >(html, 'joinToolsetsUrl');

      expect(joinToolsetsUrl('https://mcp.genfeed.ai/mcp', ['content'])).toBe(
        'https://mcp.genfeed.ai/mcp?toolsets=content',
      );
      expect(joinToolsetsUrl('https://mcp.genfeed.ai/mcp', [])).toBe(
        'https://mcp.genfeed.ai/mcp',
      );
    });

    it('rewrites the AI setup prompt shell commands with the shell-quoted URL, leaving plain text plain', () => {
      const html = renderSetupPage();
      const rewriteAgentPrompt = loadPickerFunction<
        (
          text: string,
          currentUrl: string,
          currentShellUrl: string,
          nextUrl: string,
          nextShellUrl: string,
        ) => string
      >(html, 'replaceAll', 'rewriteAgentPrompt');

      const currentUrl = 'https://mcp.genfeed.ai/mcp';
      const nextUrl = 'https://mcp.genfeed.ai/mcp?toolsets=content';
      const nextShellUrl = "'https://mcp.genfeed.ai/mcp?toolsets=content'";
      const promptFixture = [
        `Endpoint: ${currentUrl}`,
        `   - Claude Code: claude mcp add --transport http genfeed --scope user ${currentUrl}`,
        `   - Codex: codex mcp add genfeed --url ${currentUrl}`,
        `url = "${currentUrl}"`,
      ].join('\n');

      const rewritten = rewriteAgentPrompt(
        promptFixture,
        currentUrl,
        // Unquoted — shellQuote's own regex allows this URL through as-is
        // when there is no query string yet.
        currentUrl,
        nextUrl,
        nextShellUrl,
      );

      expect(rewritten).toContain(`Endpoint: ${nextUrl}`);
      expect(rewritten).toContain(`url = "${nextUrl}"`);
      expect(rewritten).toContain(`--scope user ${nextShellUrl}`);
      expect(rewritten).toContain(`--url ${nextShellUrl}`);
      // The plain (unquoted) URL must not appear where a quoted one belongs.
      expect(rewritten).not.toContain(`--scope user ${nextUrl}`);
      expect(rewritten).not.toContain(`--url ${nextUrl}`);
    });

    it('keeps a malicious endpoint override from breaking out of the inline toolset script', () => {
      vi.stubEnv(
        'GENFEED_MCP_RESOURCE_URL',
        'https://preview-mcp.genfeed.ai/mcp?x=</script><script>alert(1)</script>',
      );

      const html = renderSetupPage();

      // The dangerous literal sequence must never appear verbatim (the page
      // has other legitimate `</script>` closing tags, so only the exact
      // injected sequence is asserted, not every occurrence of the tag)...
      expect(html).not.toContain('</script><script>alert(1)</script>');
      // ...but the escaped form still carries the same string content (only
      // `<` needs escaping to break up the `</script` sequence — a lone `>`
      // is never special to the HTML tokenizer), so a real browser
      // reconstructs the original URL for the picker's own use.
      expect(html).toContain(
        '\\u003C/script>\\u003Cscript>alert(1)\\u003C/script>',
      );
    });
  });
});
