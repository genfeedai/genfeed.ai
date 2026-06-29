import process from 'node:process';

const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const DEFAULT_DOCS_URL = 'https://docs.genfeed.ai';
const DEFAULT_MCP_URL = 'https://mcp.genfeed.ai/mcp';
const API_KEY_SETTINGS_PATH = '/settings/api-keys';
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

export function getPublicMcpUrl(): string {
  return trimTrailingSlash(
    readEnv('GENFEED_MCP_RESOURCE_URL') || DEFAULT_MCP_URL,
  );
}

export function getPublicDocsUrl(): string {
  return trimTrailingSlash(readEnv('GENFEED_DOCS_URL') || DEFAULT_DOCS_URL);
}

export function getPublicAppUrl(): string {
  return trimTrailingSlash(readEnv('GENFEED_APP_URL') || DEFAULT_APP_URL);
}

export function renderSetupPage(): string {
  const mcpUrl = getPublicMcpUrl();
  const appUrl = getPublicAppUrl();
  const docsUrl = getPublicDocsUrl();
  const apiKeysUrl = `${appUrl}${API_KEY_SETTINGS_PATH}`;
  const docsGuideUrl = `${docsUrl}${DOCS_GUIDE_PATH}`;

  const mcpUrlSafe = escapeHtml(mcpUrl);
  const apiKeysUrlSafe = escapeHtml(apiKeysUrl);
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
  --bg: #000000;
  --bg-soft: #050607;
  --surface: rgba(255, 255, 255, 0.025);
  --surface-strong: rgba(255, 255, 255, 0.055);
  --edge: rgba(255, 255, 255, 0.08);
  --edge-strong: rgba(255, 255, 255, 0.16);
  --text: #f4f4f5;
  --text-soft: rgba(244, 244, 245, 0.72);
  --text-muted: rgba(244, 244, 245, 0.42);
  --text-faint: rgba(244, 244, 245, 0.22);
  --accent: #fafafa;
  --accent-foreground: #050607;
  --success: #10b981;
  --warning: #f59e0b;
  --agent: #38bdf8;
  --done: #a855f7;
  --youtube: #ff0000;
  --tiktok: #fe2c55;
  --linkedin: #0a66c2;
}
* { box-sizing: border-box; }
html { min-height: 100%; background: var(--bg); }
body {
  min-height: 100vh;
  margin: 0;
  background: var(--bg);
  color: var(--text);
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
body::after {
  position: fixed;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, rgba(0,0,0,0.18), #000 86%);
  content: "";
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
  border-bottom: 1px solid var(--edge);
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
  border: 1px solid var(--edge);
  background: #050607;
  color: var(--text);
  font-size: 12px;
  font-weight: 800;
}
.brand-name {
  color: var(--text-muted);
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
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.nav-link:hover { color: var(--text); }
.nav-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent);
  border-radius: 4px;
  background: var(--accent);
  color: var(--accent-foreground);
  padding: 0 14px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.hero {
  display: grid;
  min-height: 540px;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 460px);
  gap: 56px;
  align-items: center;
  border-bottom: 1px solid var(--edge);
  padding: 58px 0 64px;
}
.eyebrow,
.section-kicker,
.poster-kicker,
.meta-label {
  margin: 0;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.hero h1 {
  max-width: 680px;
  margin: 18px 0 0;
  color: var(--text);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 72px;
  font-weight: 700;
  line-height: 0.94;
  letter-spacing: 0;
}
.hero h1 em {
  display: block;
  color: var(--text-muted);
  font-style: italic;
  font-weight: 400;
}
.lede {
  max-width: 600px;
  margin: 22px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.8;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}
.button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--edge-strong);
  border-radius: 4px;
  background: #050607;
  color: var(--text);
  padding: 0 14px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}
.button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-foreground);
}
.button:hover { border-color: rgba(255,255,255,0.28); }
.button.primary:hover { background: #e4e4e7; }
.poster {
  position: relative;
  overflow: hidden;
  min-height: 430px;
  border: 1px solid var(--edge);
  background:
    linear-gradient(160deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018) 46%, rgba(255,255,255,0.008)),
    #050607;
  padding: 34px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.32);
}
.poster::before {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px);
  background-size: 96px 96px;
  content: "";
  opacity: 0.28;
}
.poster-inner {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 360px;
  flex-direction: column;
  justify-content: space-between;
  gap: 28px;
}
.poster-title {
  max-width: 350px;
  margin: 18px 0 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 42px;
  font-weight: 700;
  line-height: 0.98;
  letter-spacing: 0;
}
.poster-copy {
  max-width: 330px;
  margin: 14px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.flow {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--edge);
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
  color: var(--text);
  font-size: 12px;
  font-weight: 750;
}
.flow-copy {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.status-dot::before {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success);
  content: "";
}
.platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid var(--edge);
  padding-top: 18px;
}
.platform {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--edge);
  background: rgba(0,0,0,0.24);
  padding: 6px 8px;
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 700;
}
.platform::before {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  content: "";
}
.platform.youtube::before { background: var(--youtube); }
.platform.tiktok::before { background: var(--tiktok); }
.platform.linkedin::before { background: var(--linkedin); }
.endpoint-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, auto) auto;
  gap: 18px;
  align-items: end;
  border-bottom: 1px solid var(--edge);
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
  color: var(--text-muted);
  font-size: 13px;
}
.endpoint-code {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--edge);
  background: rgba(255,255,255,0.025);
  color: var(--text);
  font-family: "SF Mono", SFMono-Regular, Consolas, Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 12px;
  white-space: nowrap;
}
.copy {
  align-self: end;
  justify-self: start;
  min-height: 36px;
  border: 1px solid var(--edge-strong);
  border-radius: 4px;
  background: #050607;
  color: var(--text-soft);
  padding: 0 12px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
}
.copy:hover { border-color: rgba(255,255,255,0.28); color: var(--text); }
.section {
  border-bottom: 1px solid var(--edge);
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
  color: var(--text-muted);
  font-style: italic;
  font-weight: 400;
}
.section-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.8;
}
.client-shell {
  border: 1px solid var(--edge);
  background: var(--surface);
}
.tablist {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid var(--edge);
}
.tab {
  min-height: 46px;
  border: 0;
  border-right: 1px solid var(--edge);
  background: transparent;
  color: var(--text-muted);
  padding: 0 18px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.tab[aria-selected="true"] {
  background: var(--surface-strong);
  color: var(--text);
}
.tabpanel {
  display: none;
  padding: 0 26px 6px;
}
.tabpanel.is-active { display: block; }
.setup-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid var(--edge);
  padding: 22px 0;
}
.instruction-title {
  margin: 0;
  color: var(--text);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0;
}
.badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--edge);
  background: rgba(255,255,255,0.025);
  color: var(--text-muted);
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
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
  color: var(--text-faint);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
}
.step-title {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 750;
}
.step-copy {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}
code, pre {
  font-family: "SF Mono", SFMono-Regular, Consolas, Menlo, monospace;
}
code.inline {
  border: 1px solid var(--edge);
  background: rgba(255,255,255,0.035);
  padding: 1px 5px;
  color: var(--text-soft);
  font-size: 11px;
}
pre.command {
  margin: 12px 0 0;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--edge);
  background: #030303;
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.7;
  padding: 13px;
  white-space: pre;
}
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.meta-card {
  min-height: 190px;
  border: 1px solid var(--edge);
  background: var(--surface);
  padding: 22px;
}
.meta-card h3 {
  margin: 14px 0 0;
  color: var(--text);
  font-size: 15px;
  font-weight: 750;
}
.meta-card p {
  margin: 9px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.65;
}
.meta-card a {
  display: inline-flex;
  margin-top: 16px;
  color: var(--text-soft);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.meta-card a:hover { color: var(--text); }
.warning-note {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 12px;
  margin-top: 14px;
  border: 1px solid rgba(245,158,11,0.26);
  background: rgba(245,158,11,0.08);
  padding: 14px;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.6;
}
.warning-mark {
  color: var(--warning);
  font-weight: 900;
}
.site-footer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 18px;
  align-items: center;
  padding: 36px 0 44px;
  color: var(--text-faint);
  font-size: 11px;
}
.footer-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 16px;
}
.footer-links a {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.footer-links a:hover { color: var(--text); }
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
  .poster { min-height: 360px; }
  .copy { justify-self: start; }
}
@media (max-width: 640px) {
  .page { width: min(100vw - 24px, 1120px); }
  .site-nav { align-items: flex-start; padding: 12px 0; }
  .nav-links { gap: 10px; }
  .nav-link { display: none; }
  .hero h1 { font-size: 42px; }
  .poster { padding: 22px; }
  .poster-title { font-size: 34px; }
  .flow-row { grid-template-columns: 1fr; gap: 3px; }
  .flow-copy { white-space: normal; }
  .section { padding: 56px 0; }
  .section-title { font-size: 34px; }
  .tabpanel { padding: 0 16px 4px; }
  .tab {
    flex: 1 1 50%;
    border-bottom: 1px solid var(--edge);
    padding: 0 10px;
  }
  .step { grid-template-columns: 1fr; gap: 8px; }
  .step-number { font-size: 26px; }
  .site-footer { grid-template-columns: 1fr; }
  .footer-links { justify-content: flex-start; }
}
</style>
</head>
<body>
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
      <a class="nav-button" href="${apiKeysUrlSafe}" rel="noopener noreferrer">API keys</a>
    </div>
  </nav>

  <header class="hero">
    <div>
      <p class="eyebrow">&lt; MCP server &gt;</p>
      <h1>Connect AI agents to your content operating system.<em>From Claude Code to Codex.</em></h1>
      <p class="lede">Genfeed MCP gives compatible AI clients API-key scoped access to content, media generation, workflows, publishing, analytics, ads, and agent threads.</p>
      <div class="hero-actions">
        <a class="button primary" href="${apiKeysUrlSafe}" rel="noopener noreferrer">Create API key</a>
        <a class="button" href="${docsGuideUrlSafe}" rel="noopener noreferrer">Read MCP docs</a>
      </div>
    </div>

    <aside class="poster" aria-label="Genfeed MCP workflow preview">
      <div class="poster-inner">
        <div>
          <p class="poster-kicker">AI model context protocol</p>
          <h2 class="poster-title">Workspace context for every agent.</h2>
          <p class="poster-copy">Research, create, publish, and measure without copying data between Genfeed and your AI client.</p>
        </div>
        <div class="flow" aria-label="Content operating loop">
          <div class="flow-row">
            <span class="flow-name">Research</span>
            <span class="flow-copy">Trending topics, analytics, audience signals</span>
            <span class="status-dot">Live</span>
          </div>
          <div class="flow-row">
            <span class="flow-name">Generate</span>
            <span class="flow-copy">Video, image, music, article, campaign assets</span>
            <span class="status-dot">Ready</span>
          </div>
          <div class="flow-row">
            <span class="flow-name">Publish</span>
            <span class="flow-copy">Schedule posts and trigger workflows</span>
            <span class="status-dot">Guarded</span>
          </div>
        </div>
        <div class="platforms" aria-label="Platform publishing preview">
          <span class="platform youtube">YouTube</span>
          <span class="platform tiktok">TikTok</span>
          <span class="platform linkedin">LinkedIn</span>
        </div>
      </div>
    </aside>
  </header>

  <section class="endpoint-band" aria-labelledby="endpoint-title">
    <div class="endpoint-copy">
      <p class="meta-label" id="endpoint-title">Production endpoint</p>
      <p>Use the hosted Streamable HTTP endpoint. Localhost belongs only in self-hosted development config.</p>
    </div>
    <div>
      <div class="endpoint-code" id="mcp-url">${mcpUrlSafe}</div>
    </div>
    <button class="copy" type="button" data-copy="${mcpUrlSafe}" aria-label="Copy MCP endpoint">Copy</button>
  </section>

  <section class="section" aria-labelledby="setup-title">
    <div class="section-head">
      <div>
        <p class="section-kicker">Client setup</p>
        <h2 class="section-title" id="setup-title">One server. <em>Two agent clients.</em></h2>
      </div>
      <p class="section-copy">Claude Code and Codex both connect to the same production MCP server with the same bearer-token model. Create a Genfeed API key, export it locally, then register the remote HTTP server.</p>
    </div>

    <div class="client-shell">
      <div class="tablist" role="tablist" aria-label="Client setup instructions">
        <button class="tab" id="tab-claude-code" type="button" role="tab" aria-selected="true" aria-controls="panel-claude-code" data-tab="claude-code">Claude Code</button>
        <button class="tab" id="tab-codex" type="button" role="tab" aria-selected="false" aria-controls="panel-codex" data-tab="codex">Codex</button>
      </div>

      <section class="tabpanel is-active" id="panel-claude-code" role="tabpanel" aria-labelledby="tab-claude-code" data-panel="claude-code">
        <div class="setup-title-row">
          <h3 class="instruction-title">Claude Code setup</h3>
          <span class="badge">HTTP transport</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Export a Genfeed API key</p>
              <p class="step-copy">Create a <code class="inline">gf_</code> key in Genfeed settings, then export it before adding the server.</p>
              <pre class="command"><code>export GENFEED_API_KEY=gf_live_xxx</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Add the remote HTTP server</p>
              <p class="step-copy">User scope makes Genfeed available across local Claude Code sessions.</p>
              <pre class="command"><code>${claudeCommandSafe}</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">03</span>
            <div>
              <p class="step-title">Verify the connection</p>
              <p class="step-copy">Run <code class="inline">claude mcp list</code> or open <code class="inline">/mcp</code> inside Claude Code.</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="tabpanel" id="panel-codex" role="tabpanel" aria-labelledby="tab-codex" data-panel="codex">
        <div class="setup-title-row">
          <h3 class="instruction-title">Codex setup</h3>
          <span class="badge">CLI and IDE config</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Export a Genfeed API key</p>
              <p class="step-copy">Codex reads the bearer token from the environment variable configured for this server.</p>
              <pre class="command"><code>export GENFEED_API_KEY=gf_live_xxx</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Add the Streamable HTTP server</p>
              <p class="step-copy">The CLI and IDE extension share the server definition through <code class="inline">~/.codex/config.toml</code>.</p>
              <pre class="command"><code>${codexCommandSafe}</code></pre>
            </div>
          </li>
          <li class="step">
            <span class="step-number">03</span>
            <div>
              <p class="step-title">Or edit config.toml directly</p>
              <p class="step-copy">Use the same settings in a user or trusted project config.</p>
              <pre class="command"><code>${codexTomlSafe}</code></pre>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </section>

  <section class="section" aria-labelledby="details-title">
    <div class="section-head">
      <div>
        <p class="section-kicker">Server details</p>
        <h2 class="section-title" id="details-title">Production by default. <em>Guarded by API keys.</em></h2>
      </div>
      <p class="section-copy">The browser page is documentation. Actual MCP calls use the hosted <code class="inline">${mcpUrlSafe}</code> endpoint and the permissions attached to the API key on each request.</p>
    </div>

    <div class="meta-grid">
      <article class="meta-card">
        <p class="meta-label">Authentication</p>
        <h3>Bearer token required</h3>
        <p>Send <code class="inline">Authorization: Bearer gf_live_xxx</code> with every MCP request. Keys can be created and revoked from Genfeed app settings.</p>
        <a href="${apiKeysUrlSafe}" rel="noopener noreferrer">Manage keys</a>
      </article>
      <article class="meta-card">
        <p class="meta-label">Transport</p>
        <h3>Streamable HTTP</h3>
        <p>Clients should register Genfeed as a remote HTTP MCP server, not an <code class="inline">npx</code> stdio process and not localhost.</p>
        <a href="/v1/config" rel="noopener noreferrer">View config</a>
      </article>
      <article class="meta-card">
        <p class="meta-label">Status</p>
        <h3>Service discovery</h3>
        <p>Use the health and config endpoints when debugging client discovery, deployment routing, or stale MCP client settings.</p>
        <a href="/v1/health" rel="noopener noreferrer">View health</a>
      </article>
    </div>

    <div class="warning-note" role="note">
      <span class="warning-mark">!</span>
      <span>Treat API keys like passwords. Do not commit them or paste them into shared logs.</span>
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
      setActiveTab(tab.getAttribute('data-tab') || 'claude-code');
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
      setActiveTab(tabs[nextIndex].getAttribute('data-tab') || 'claude-code');
    });
  });

  document.querySelectorAll('button.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy') || '';
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
