import process from 'node:process';

import {
  staticSurfaceClassNames,
  staticSurfaceCss,
} from '@genfeedai/ui/static/surface';

const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const DEFAULT_DOCS_URL = 'https://docs.genfeed.ai';
const DEFAULT_MCP_URL = 'https://mcp.genfeed.ai/mcp';
const CONNECT_GENFEED_PATH = '/connect';
const DOCS_GUIDE_PATH = '/api-reference/mcp';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function readEnv(name: string): string | undefined {
  // biome-ignore lint/style/noProcessEnv: MCP setup docs need deploy-time endpoint overrides before Nest config is available.
  return process.env[name];
}

function readPublicUrl(name: string, fallback: string): string {
  const raw = readEnv(name);
  if (!raw) return trimTrailingSlash(fallback);
  let protocol: string;
  try {
    ({ protocol } = new URL(raw));
  } catch {
    return trimTrailingSlash(fallback);
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    return trimTrailingSlash(fallback);
  }
  // Return raw (not URL#toString) to preserve original encoding.
  return trimTrailingSlash(raw);
}

function buildAgentSetupPrompt(params: {
  apiKeysUrl: string;
  mcpUrl: string;
}): string {
  const { apiKeysUrl, mcpUrl } = params;

  return `Set up the Genfeed MCP server on this machine.

Endpoint: ${mcpUrl}
Authentication env var: GENFEED_API_KEY
Guided connection flow: ${apiKeysUrl}

Do this end to end:
1. Detect whether Claude Code, Codex, or both are installed.
2. Check whether GENFEED_API_KEY is available in the shell environment.
3. If the key is missing, ask me to export it locally or send me to the guided connection URL above. Do not request or paste the key into source-controlled files, command history, logs, or this chat.
4. Configure Genfeed as a remote Streamable HTTP MCP server:
   - Claude Code: claude mcp add --transport http genfeed --scope user ${mcpUrl} --header "Authorization: Bearer $GENFEED_API_KEY"
   - Codex: codex mcp add genfeed --url ${mcpUrl} --bearer-token-env-var GENFEED_API_KEY
   - If the Codex CLI is unavailable, update the user-level ~/.codex/config.toml with:

[mcp_servers.genfeed]
url = "${mcpUrl}"
bearer_token_env_var = "GENFEED_API_KEY"

5. Verify the server appears in the client's MCP list or config.
6. Report exactly what changed and any manual step still required.`;
}

export function getPublicMcpUrl(): string {
  return readPublicUrl('GENFEED_MCP_RESOURCE_URL', DEFAULT_MCP_URL);
}

export function getPublicDocsUrl(): string {
  return readPublicUrl('GENFEED_DOCS_URL', DEFAULT_DOCS_URL);
}

export function getPublicAppUrl(): string {
  return readPublicUrl('GENFEED_APP_URL', DEFAULT_APP_URL);
}

export function renderSetupPage(): string {
  const ui = staticSurfaceClassNames;
  const mcpUrl = getPublicMcpUrl();
  const appUrl = getPublicAppUrl();
  const docsUrl = getPublicDocsUrl();
  const connectUrl = `${appUrl}${CONNECT_GENFEED_PATH}`;
  const docsGuideUrl = `${docsUrl}${DOCS_GUIDE_PATH}`;

  const mcpUrlSafe = escapeHtml(mcpUrl);
  const connectUrlSafe = escapeHtml(connectUrl);
  const docsUrlSafe = escapeHtml(docsUrl);
  const docsGuideUrlSafe = escapeHtml(docsGuideUrl);
  const claudeCommandSafe = escapeHtml(
    `claude mcp add --transport http genfeed --scope user ${mcpUrl} --header "Authorization: Bearer $GENFEED_API_KEY"`,
  );
  const codexCommandSafe = escapeHtml(
    `codex mcp add genfeed --url ${mcpUrl} --bearer-token-env-var GENFEED_API_KEY`,
  );
  const codexTomlSafe = escapeHtml(`[mcp_servers.genfeed]
url = "${mcpUrl}"
bearer_token_env_var = "GENFEED_API_KEY"`);
  const agentSetupPromptSafe = escapeHtml(
    buildAgentSetupPrompt({ apiKeysUrl: connectUrl, mcpUrl }),
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Genfeed MCP Server</title>
<style>
:root {
  color-scheme: dark;
}
${staticSurfaceCss}
* { box-sizing: border-box; }
html { min-height: 100%; background: #050607; }
body {
  min-height: 100vh;
  margin: 0;
  background: var(--gf-bg-primary);
  color: var(--gf-text-primary);
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
}
body::before {
  position: fixed;
  inset: 0;
  z-index: -2;
  background-image:
    linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 80px 80px;
  content: "";
  opacity: 0.55;
}
button, input { font: inherit; }
button { cursor: pointer; }
a { color: inherit; text-decoration: none; }
.page {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
}
.site-nav {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--gf-border);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.mark {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--gf-border);
  border-radius: var(--gf-surface-radius);
  background: var(--gf-bg-primary);
  color: var(--gf-text-primary);
  font-size: 12px;
  font-weight: 800;
}
.brand-name {
  color: var(--gf-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.nav-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
}
.nav-link {
  color: var(--gf-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.nav-link:hover { color: var(--gf-text-primary); }
.hero {
  display: grid;
  min-height: 540px;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 460px);
  gap: 56px;
  align-items: center;
  border-bottom: 1px solid var(--gf-border);
  padding: 58px 0 64px;
}
.eyebrow,
.section-kicker,
.meta-label {
  margin: 0;
  color: var(--gf-text-faint);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.hero h1 {
  max-width: 680px;
  margin: 18px 0 0;
  color: var(--gf-text-primary);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 72px;
  font-weight: 700;
  line-height: 0.94;
  letter-spacing: 0;
}
.hero h1 em {
  display: block;
  color: var(--gf-text-muted);
  font-style: italic;
  font-weight: 400;
}
.lede {
  max-width: 600px;
  margin: 22px 0 0;
  color: var(--gf-text-muted);
  font-size: 14px;
  line-height: 1.8;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}
.flow {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--gf-border);
  padding-top: 18px;
}
.flow-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.055);
  padding: 10px 0;
}
.flow-row:last-child { border-bottom: 0; }
.flow-name {
  color: var(--gf-text-primary);
  font-size: 12px;
  font-weight: 750;
}
.flow-copy {
  min-width: 0;
  overflow: hidden;
  color: var(--gf-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--gf-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.status-dot::before {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--gf-success);
  content: "";
}
.platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid var(--gf-border);
  padding-top: 18px;
}
.platform::before {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  content: "";
}
.platform.youtube::before { background: var(--gf-platform-youtube); }
.platform.tiktok::before { background: var(--gf-platform-tiktok); }
.platform.linkedin::before { background: var(--gf-platform-linkedin); }
.endpoint-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, auto) auto;
  gap: 18px;
  align-items: end;
  border-bottom: 1px solid var(--gf-border);
  padding: 30px 0;
}
.endpoint-band > div {
  min-width: 0;
}
.endpoint-copy {
  min-width: 0;
}
.endpoint-copy p {
  margin: 8px 0 0;
  color: var(--gf-text-muted);
  font-size: 13px;
}
.endpoint-code {
  min-width: 0;
  color: var(--gf-text-primary);
  line-height: 1.6;
  white-space: nowrap;
}
.copy {
  align-self: end;
  justify-self: start;
}
.section {
  border-bottom: 1px solid var(--gf-border);
  padding: 82px 0;
}
.section-head {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 42px;
  align-items: end;
  margin-bottom: 32px;
}
.section-title {
  margin: 14px 0 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
}
.section-title em {
  color: var(--gf-text-muted);
  font-style: italic;
  font-weight: 400;
}
.section-copy {
  margin: 0;
  color: var(--gf-text-muted);
  font-size: 14px;
  line-height: 1.8;
}
.tablist {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid var(--gf-border);
}
.tab {
  min-height: 46px;
  border: 0;
  border-right: 1px solid var(--gf-border);
  background: transparent;
  color: var(--gf-text-muted);
  padding: 0 18px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.tab[aria-selected="true"] {
  background: var(--gf-bg-hover);
  color: var(--gf-text-primary);
}
.tabpanel {
  display: none;
  padding: 0 26px 6px;
}
.tabpanel.is-active { display: block; }
.agent-prompt-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: 24px;
  padding: 24px 0 20px;
}
.agent-prompt-copy {
  min-width: 0;
}
.agent-prompt-copy p {
  margin: 0 0 14px;
  color: var(--gf-text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.prompt-block {
  max-height: 430px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
}
.prompt-actions {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  border-left: 1px solid rgba(255,255,255,0.06);
  padding-left: 22px;
}
.prompt-note {
  margin: 0;
  color: var(--gf-text-muted);
  font-size: 12px;
  line-height: 1.6;
}
.setup-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--gf-border);
  padding: 22px 0;
}
.instruction-title {
  margin: 0;
  color: var(--gf-text-primary);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0;
}
.steps {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
.step {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 18px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  padding: 24px 0;
}
.step > div {
  min-width: 0;
}
.step:last-child { border-bottom: 0; }
.step-number {
  color: var(--gf-text-faint);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
}
.step-title {
  margin: 0;
  color: var(--gf-text-primary);
  font-size: 14px;
  font-weight: 750;
}
.step-copy {
  margin: 5px 0 0;
  color: var(--gf-text-muted);
  font-size: 13px;
  line-height: 1.6;
}
code, pre {
  font-family: "SF Mono", SFMono-Regular, Consolas, Menlo, monospace;
}
pre.command {
  margin: 12px 0 0;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.mcp-warning-note {
  margin-top: 14px;
}
.warning-mark {
  color: var(--gf-warning);
  font-weight: 900;
}
.site-footer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: center;
  padding: 36px 0 44px;
  color: var(--gf-text-faint);
  font-size: 11px;
}
.footer-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 16px;
}
.footer-links a {
  color: var(--gf-text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.footer-links a:hover { color: var(--gf-text-primary); }
@media (max-width: 920px) {
  .hero,
  .section-head,
  .meta-grid,
  .endpoint-band {
    grid-template-columns: 1fr;
  }
  .hero {
    min-height: auto;
    gap: 34px;
    padding: 48px 0 54px;
  }
  .hero h1 { font-size: 58px; }
  .copy { justify-self: start; }
}
@media (max-width: 640px) {
  .page { width: min(100vw - 24px, 1120px); }
  .site-nav { align-items: flex-start; padding: 12px 0; }
  .nav-links { gap: 10px; }
  .nav-link { display: none; }
  .hero h1 { font-size: 42px; }
  .flow-row { grid-template-columns: 1fr; gap: 3px; }
  .flow-copy { white-space: normal; }
  .section { padding: 56px 0; }
  .section-title { font-size: 34px; }
  .tabpanel { padding: 0 16px 4px; }
  .agent-prompt-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .prompt-actions {
    border-left: 0;
    border-top: 1px solid rgba(255,255,255,0.06);
    padding-top: 16px;
    padding-left: 0;
  }
  .tab {
    flex: 1 1 100%;
    border-bottom: 1px solid var(--gf-border);
    padding: 0 10px;
  }
  .step { grid-template-columns: 1fr; gap: 8px; }
  .step-number { font-size: 26px; }
  .site-footer { grid-template-columns: 1fr; }
  .footer-links { justify-content: flex-start; }
}
</style>
</head>
<body class="${ui.root}">
<main class="page">
  <nav class="site-nav" aria-label="Genfeed MCP">
    <a class="brand" href="https://genfeed.ai" rel="noopener noreferrer">
      <span class="mark" aria-hidden="true">G</span>
      <span class="brand-name">Genfeed MCP</span>
    </a>
    <div class="nav-links" aria-label="MCP navigation">
      <a class="nav-link" href="${docsGuideUrlSafe}" rel="noopener noreferrer">Docs</a>
      <a class="nav-link" href="/v1/config" rel="noopener noreferrer">Config</a>
      <a class="nav-link" href="/v1/health" rel="noopener noreferrer">Health</a>
      <a class="${ui.buttonPrimary}" href="${connectUrlSafe}" rel="noopener noreferrer">Connect Genfeed</a>
    </div>
  </nav>

  <header class="hero">
    <div>
      <p class="eyebrow">&lt; MCP server &gt;</p>
      <h1>Genfeed MCP.<em>Claude + Codex.</em></h1>
      <p class="lede">Connect AI clients to Genfeed content, workflows, publishing, analytics, and ads with an API key.</p>
      <div class="hero-actions">
        <a class="${ui.buttonPrimary}" href="${connectUrlSafe}" rel="noopener noreferrer">Start guided setup</a>
        <a class="${ui.buttonSecondary}" href="${docsGuideUrlSafe}" rel="noopener noreferrer">Read MCP docs</a>
      </div>
    </div>

    <aside class="${ui.featureCard}" aria-label="Genfeed MCP workflow preview">
      <div class="${ui.featureCardInner}">
        <div>
          <p class="${ui.featureCardKicker}">AI model context protocol</p>
          <h2 class="${ui.featureCardTitle}">Agent workspace access.</h2>
          <p class="${ui.featureCardCopy}">Read, create, publish, and measure from your AI client.</p>
        </div>
        <div class="flow" aria-label="Content operating loop">
          <div class="flow-row">
            <span class="flow-name">Research</span>
            <span class="flow-copy">Topics, analytics, audience signals</span>
            <span class="status-dot">Live</span>
          </div>
          <div class="flow-row">
            <span class="flow-name">Generate</span>
            <span class="flow-copy">Media and campaign assets</span>
            <span class="status-dot">Ready</span>
          </div>
          <div class="flow-row">
            <span class="flow-name">Publish</span>
            <span class="flow-copy">Posts and workflows</span>
            <span class="status-dot">Guarded</span>
          </div>
        </div>
        <div class="platforms" aria-label="Platform publishing preview">
          <span class="${ui.chip} platform youtube">YouTube</span>
          <span class="${ui.chip} platform tiktok">TikTok</span>
          <span class="${ui.chip} platform linkedin">LinkedIn</span>
        </div>
      </div>
    </aside>
  </header>

  <section class="endpoint-band" aria-labelledby="endpoint-title">
    <div class="endpoint-copy">
      <p class="meta-label" id="endpoint-title">Endpoint</p>
      <p>Hosted Streamable HTTP. Use localhost only for self-hosting.</p>
    </div>
    <div>
      <div class="${ui.codeBlock} endpoint-code" id="mcp-url">${mcpUrlSafe}</div>
    </div>
    <button class="${ui.buttonSecondary} copy" type="button" data-copy="${mcpUrlSafe}" aria-label="Copy MCP endpoint">Copy</button>
  </section>

  <section class="section" aria-labelledby="setup-title">
    <div class="section-head">
      <div>
        <p class="section-kicker">Setup</p>
        <h2 class="section-title" id="setup-title">One server. <em>Any client.</em></h2>
      </div>
      <p class="section-copy">Export a Genfeed API key, then add the remote HTTP server to your client.</p>
    </div>

    <div class="${ui.card}">
      <div class="tablist" role="tablist" aria-label="Client setup instructions">
        <button class="tab" id="tab-agent-prompt" type="button" role="tab" aria-selected="true" aria-controls="panel-agent-prompt" data-tab="agent-prompt">AI prompt</button>
        <button class="tab" id="tab-claude-code" type="button" role="tab" aria-selected="false" aria-controls="panel-claude-code" data-tab="claude-code">Claude Code</button>
        <button class="tab" id="tab-codex" type="button" role="tab" aria-selected="false" aria-controls="panel-codex" data-tab="codex">Codex</button>
      </div>

      <section class="tabpanel is-active" id="panel-agent-prompt" role="tabpanel" aria-labelledby="tab-agent-prompt" data-panel="agent-prompt">
        <div class="setup-title-row">
          <h3 class="instruction-title">AI agent setup prompt</h3>
          <span class="${ui.badge}">Copy/paste</span>
        </div>
        <div class="agent-prompt-grid">
          <div class="agent-prompt-copy">
            <p>Drop this into Claude Code, Codex, or another local agent with shell access. The agent detects the client, configures Genfeed, protects the API key, and verifies the result.</p>
            <pre class="${ui.codeBlock} command prompt-block"><code id="agent-setup-prompt">${agentSetupPromptSafe}</code></pre>
          </div>
          <div class="prompt-actions">
            <button class="${ui.buttonPrimary} copy" type="button" data-copy-source="agent-setup-prompt" aria-label="Copy AI setup prompt">Copy AI prompt</button>
            <p class="prompt-note">The prompt references <code class="${ui.inlineCode}">GENFEED_API_KEY</code> by env var so the key stays out of the page and config files.</p>
          </div>
        </div>
      </section>

      <section class="tabpanel" id="panel-claude-code" role="tabpanel" aria-labelledby="tab-claude-code" data-panel="claude-code">
        <div class="setup-title-row">
          <h3 class="instruction-title">Claude Code setup</h3>
          <span class="${ui.badge}">HTTP transport</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Export API key</p>
              <p class="step-copy">Create a <code class="${ui.inlineCode}">gf_</code> key in Genfeed settings.</p>
              <pre class="${ui.codeBlock} command"><code>export GENFEED_API_KEY=gf_live_xxx</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Add MCP server</p>
              <p class="step-copy">Register the hosted endpoint in user scope.</p>
              <pre class="${ui.codeBlock} command"><code>${claudeCommandSafe}</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">03</span>
            <div>
              <p class="step-title">Verify</p>
              <p class="step-copy">Run <code class="${ui.inlineCode}">claude mcp list</code> or open <code class="${ui.inlineCode}">/mcp</code>.</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="tabpanel" id="panel-codex" role="tabpanel" aria-labelledby="tab-codex" data-panel="codex">
        <div class="setup-title-row">
          <h3 class="instruction-title">Codex setup</h3>
          <span class="${ui.badge}">CLI and IDE config</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Export API key</p>
              <p class="step-copy">Codex reads this env var for the bearer token.</p>
              <pre class="${ui.codeBlock} command"><code>export GENFEED_API_KEY=gf_live_xxx</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Add MCP server</p>
              <p class="step-copy">The CLI and IDE share <code class="${ui.inlineCode}">~/.codex/config.toml</code>.</p>
              <pre class="${ui.codeBlock} command"><code>${codexCommandSafe}</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">03</span>
            <div>
              <p class="step-title">Manual config</p>
              <p class="step-copy">Paste this into a user or trusted project config.</p>
              <pre class="${ui.codeBlock} command"><code>${codexTomlSafe}</code></pre>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </section>

  <section class="section" aria-labelledby="details-title">
    <div class="section-head">
      <div>
        <p class="section-kicker">Details</p>
        <h2 class="section-title" id="details-title">Endpoint. <em>API auth.</em></h2>
      </div>
      <p class="section-copy">MCP calls go to <code class="${ui.inlineCode}">${mcpUrlSafe}</code> and use the permissions on the API key.</p>
    </div>

    <div class="meta-grid">
      <article class="${ui.infoCard}">
        <p class="meta-label">Authentication</p>
        <h3>Bearer token</h3>
        <p>Send <code class="${ui.inlineCode}">Authorization: Bearer gf_live_xxx</code> with every request.</p>
        <a href="${connectUrlSafe}" rel="noopener noreferrer">Open guided setup</a>
      </article>
      <article class="${ui.infoCard}">
        <p class="meta-label">Transport</p>
        <h3>HTTP transport</h3>
        <p>Register Genfeed as a remote MCP server. No <code class="${ui.inlineCode}">npx</code> or localhost for cloud.</p>
        <a href="/v1/config" rel="noopener noreferrer">View config</a>
      </article>
      <article class="${ui.infoCard}">
        <p class="meta-label">Status</p>
        <h3>Health checks</h3>
        <p>Use health and config to debug routing or stale client settings.</p>
        <a href="/v1/health" rel="noopener noreferrer">View health</a>
      </article>
    </div>

    <div class="${ui.warningNote} mcp-warning-note" role="note">
      <span class="warning-mark">!</span>
      <span>Keep API keys out of commits and shared logs.</span>
    </div>
  </section>

  <footer class="site-footer">
    <span>Genfeed.ai MCP</span>
    <div class="footer-links">
      <a href="${docsUrlSafe}" rel="noopener noreferrer">Documentation</a>
      <a href="${docsGuideUrlSafe}" rel="noopener noreferrer">MCP guide</a>
      <a href="/v1/config" rel="noopener noreferrer">Config</a>
      <a href="/v1/health" rel="noopener noreferrer">Health</a>
    </div>
  </footer>
</main>
<script>
  function setActiveTab(next) {
    document.querySelectorAll('[role="tab"][data-tab]').forEach(function (tab) {
      var active = tab.getAttribute('data-tab') === next;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[role="tabpanel"][data-panel]').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.getAttribute('data-panel') === next);
    });
  }

  document.querySelectorAll('[role="tab"][data-tab]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      setActiveTab(tab.getAttribute('data-tab') || 'agent-prompt');
    });
    tab.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"][data-tab]'));
      var index = tabs.indexOf(tab);
      var nextIndex = event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[nextIndex].focus();
      setActiveTab(tabs[nextIndex].getAttribute('data-tab') || 'agent-prompt');
    });
  });

  document.querySelectorAll('button[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy') || '';
      navigator.clipboard.writeText(text).then(function () {
        var previous = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = previous; }, 1500);
      });
    });
  });

  document.querySelectorAll('button[data-copy-source]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sourceId = btn.getAttribute('data-copy-source') || '';
      var source = document.getElementById(sourceId);
      var text = source ? source.textContent || '' : '';
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        var previous = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = previous; }, 1500);
      });
    });
  });
</script>
</body>
</html>`;
}
