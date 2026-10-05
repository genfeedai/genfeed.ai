import process from 'node:process';
import {
  getToolsForRole,
  type McpAccessMode,
  TOOLSETS,
} from '@genfeedai/actions';
import {
  API_KEY_SCOPE_PRESETS,
  MCP_CLAUDE_SCOPE_CEILING,
} from '@genfeedai/contracts/constants';
import type { McpResourceIdentifierResolution } from '@genfeedai/contracts/interfaces';
import {
  buildConnectGenfeedChatPrompt,
  buildConnectGenfeedInstructions,
  buildGenfeedAgentSetupPrompt,
  GENFEED_SKILLS_INSTALL_COMMAND,
} from '@genfeedai/helpers/integrations/connect-genfeed.helper';
import {
  deriveClaudeMcpResourceIdentifier,
  OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH,
  resolveMcpResourceIdentifier,
} from '@genfeedai/helpers/integrations/mcp-resource.helper';
import {
  staticSurfaceClassNames,
  staticSurfaceCss,
} from '@genfeedai/ui/static/surface';

import { SATOSHI_VARIABLE_WOFF2_BASE64 } from './satoshi-font';
import {
  getMcpServerInfo,
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_NAME,
} from './server-identity';

const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const DEFAULT_API_URL = 'https://api.genfeed.ai';
const DEFAULT_DOCS_URL = 'https://docs.genfeed.ai';
const DEFAULT_WEBSITE_URL = 'https://genfeed.ai';
const DEFAULT_MCP_URL = 'https://mcp.genfeed.ai/mcp';
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
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

/**
 * Safe JS string-literal encoding for a value embedded directly in an inline
 * `<script>` block (the toolset picker below needs the endpoint as data the
 * client can recompute from). `JSON.stringify` does not escape `/`, so a
 * value containing a literal `</script>` would otherwise close the
 * surrounding script element early. Escaping every `<` neutralizes that
 * regardless of what follows it. U+2028 (LINE SEPARATOR) and U+2029
 * (PARAGRAPH SEPARATOR) are also escaped: `JSON.stringify` leaves them as
 * literal characters, but they terminate a JS string/statement outside a
 * string literal per the ECMAScript grammar, so an unescaped one in the
 * source text would break the surrounding script (or, depending on where it
 * lands, silently truncate the string value).
 *
 * The endpoint comes from `deriveMcpResourceIdentifier`, whose WHATWG URL
 * parse percent-encodes `<`, `>` and every non-ASCII code point in the path,
 * so no accepted configuration can currently reach these branches. The
 * escaping stays as defence in depth; it is exported so its contract is
 * unit-tested directly rather than through an environment override.
 */
export function toInlineScriptStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function readEnv(name: string): string | undefined {
  return process.env[name];
}

function renderPostHogSnippet(): string {
  const projectToken = readEnv('POSTHOG_PROJECT_API_KEY');
  if (!projectToken || !/^phc_[A-Za-z0-9]+$/.test(projectToken)) {
    return '';
  }

  const token = JSON.stringify(projectToken);
  const host = JSON.stringify(
    readPublicUrl('POSTHOG_HOST', DEFAULT_POSTHOG_HOST),
  );

  // Official PostHog queue loader. The project token is write-only and safe
  // for browser use, but is still pattern-validated before entering HTML.
  return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${token}, {
  api_host: ${host},
  autocapture: {
    capture_copied_text: false,
    dom_event_allowlist: ["click"],
    element_allowlist: ["a", "button"]
  },
  capture_pageleave: true,
  capture_pageview: true,
  cookieless_mode: "always",
  defaults: "2026-05-30",
  disable_session_recording: true,
  person_profiles: "never"
});
</script>`;
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

function readFirstPublicUrl(names: string[], fallback: string): string {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return readPublicUrl(name, fallback);
    }
  }
  return trimTrailingSlash(fallback);
}

function buildAgentSetupPrompt(params: {
  apiKeysUrl: string;
  mcpUrl: string;
}): string {
  const { apiKeysUrl, mcpUrl } = params;

  return `${buildGenfeedAgentSetupPrompt(mcpUrl)}

Guided connection flow: ${apiKeysUrl}
For the Genfeed CLI, only if requested separately, run genfeed login with no flags. The human approves in the browser. Do not paste a secret into this chat.`;
}

/**
 * The OAuth protected-resource identifier this server advertises, derived by
 * the rule the API token endpoint enforces (#4553): the first configured key
 * in `MCP_RESOURCE_URL_ENV_KEYS` wins and every spelling — with or without
 * `/mcp`, with or without a trailing slash — normalizes to `<origin>/mcp`.
 * A configured but invalid value throws `McpResourceConfigurationError`
 * naming the variable; `main.ts` calls this once at boot so a broken
 * deployment fails there rather than at a user's token exchange.
 */
export function resolvePublicMcpResource(): McpResourceIdentifierResolution {
  return resolveMcpResourceIdentifier(readEnv, DEFAULT_MCP_URL);
}

export function getPublicMcpUrl(): string {
  return resolvePublicMcpResource().identifier;
}

export function getPublicClaudeMcpUrl(): string {
  return deriveClaudeMcpResourceIdentifier(getPublicMcpUrl());
}

export function getOAuthIssuerUrl(): string {
  return readFirstPublicUrl(
    ['GENFEEDAI_API_PUBLIC_URL', 'GENFEEDAI_API_URL'],
    DEFAULT_API_URL,
  );
}

export function getPublicMcpResourceMetadataUrl(
  mode: McpAccessMode = 'standard',
): string {
  const path =
    mode === 'claude'
      ? `${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${new URL(getPublicClaudeMcpUrl()).pathname}`
      : OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH;
  return new URL(path, getPublicMcpUrl()).toString();
}

export function getMcpWwwAuthenticateHeader(
  mode: McpAccessMode = 'standard',
): string {
  const scopes =
    mode === 'claude' ? MCP_CLAUDE_SCOPE_CEILING : API_KEY_SCOPE_PRESETS.mcp;
  return `Bearer resource_metadata="${getPublicMcpResourceMetadataUrl(mode)}", scope="${scopes.join(' ')}"`;
}

export function getMcpProtectedResourceMetadata(
  mode: McpAccessMode = 'standard',
) {
  return {
    authorization_servers: [getOAuthIssuerUrl()],
    bearer_methods_supported: ['header'],
    resource: mode === 'claude' ? getPublicClaudeMcpUrl() : getPublicMcpUrl(),
    resource_documentation: `${getPublicDocsUrl()}/api-reference/mcp`,
    resource_name: 'Genfeed',
    resource_policy_uri: `${getPublicWebsiteUrl()}/privacy`,
    resource_tos_uri: `${getPublicWebsiteUrl()}/terms`,
    scopes_supported: [
      ...(mode === 'claude'
        ? MCP_CLAUDE_SCOPE_CEILING
        : API_KEY_SCOPE_PRESETS.mcp),
    ],
  };
}

/**
 * `getMcpServerCard()` is unauthenticated and publicly fetchable, so its
 * `toolCount` per toolset must reflect what an anonymous/plain `user` caller
 * would actually see from `tools/list` — not the unfiltered catalog count,
 * which would advertise admin- and superadmin-gated tools (e.g.
 * `resolve_approval`) the caller cannot invoke.
 */
function getUserVisibleToolsetSummaries(): Array<{
  description: string;
  isAlwaysOn: boolean;
  name: string;
  toolCount: number;
}> {
  const userVisibleTools = getToolsForRole('mcp', 'user');

  const toolCountByToolset = new Map<string, number>();
  for (const tool of userVisibleTools) {
    toolCountByToolset.set(
      tool.toolset,
      (toolCountByToolset.get(tool.toolset) ?? 0) + 1,
    );
  }

  return TOOLSETS.filter((definition) =>
    toolCountByToolset.has(definition.name),
  ).map((definition) => ({
    description: definition.description,
    isAlwaysOn: definition.isAlwaysOn,
    name: definition.name,
    toolCount: toolCountByToolset.get(definition.name) ?? 0,
  }));
}

/**
 * Same user-visible counts as `getUserVisibleToolsetSummaries`, trimmed to
 * the server-card schema's `toolsets` shape (no `isAlwaysOn`).
 */
function getUserVisibleToolsetCards(): Array<{
  description: string;
  name: string;
  toolCount: number;
}> {
  return getUserVisibleToolsetSummaries().map(
    ({ description, name, toolCount }) => ({ description, name, toolCount }),
  );
}

export function getMcpServerCard() {
  const serverInfo = getMcpServerInfo(getPublicMcpUrl(), getPublicWebsiteUrl());

  return {
    $schema:
      'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
    authentication: {
      required: true,
      schemes: ['bearer', 'oauth2'],
    },
    capabilities: {
      resources: {},
      tools: {},
    },
    description: MCP_SERVER_DESCRIPTION,
    documentationUrl: `${getPublicDocsUrl()}/api-reference/mcp`,
    iconUrl: serverInfo.icons?.[0]?.src,
    name: MCP_SERVER_NAME,
    protocolVersion: '2025-06-18',
    serverInfo,
    toolsets: getUserVisibleToolsetCards(),
    transport: {
      endpoint: getPublicMcpUrl(),
      type: 'streamable-http',
    },
    version: '1.0',
  };
}

export function getPublicDocsUrl(): string {
  return readPublicUrl('GENFEED_DOCS_URL', DEFAULT_DOCS_URL);
}

/** The operator's public website; its /privacy and /terms are advertised. */
export function getPublicWebsiteUrl(): string {
  return readPublicUrl('GENFEEDAI_PUBLIC_URL', DEFAULT_WEBSITE_URL);
}

export function getPublicAppUrl(): string {
  return readPublicUrl('GENFEED_APP_URL', DEFAULT_APP_URL);
}

/**
 * A `<pre><code></code></pre>` command/prompt block paired with its own copy
 * button. Every setup tab uses this so the picker script below only has to
 * know a handful of element ids, not one bespoke markup shape per client.
 * `multiline` swaps in the scrollable `prompt-block` treatment for the two
 * blocks long enough to need it (the chat prompt and the shell-agent
 * prompt); single-line commands render as a plain code block.
 */
function renderCommandBlock(params: {
  id: string;
  label: string;
  multiline?: boolean;
  textSafe: string;
  ui: typeof staticSurfaceClassNames;
}): string {
  const { id, label, multiline, textSafe, ui } = params;
  const preClass = multiline
    ? `${ui.codeBlock} command prompt-block`
    : `${ui.codeBlock} command`;
  return `<div class="code-row">
          <pre class="${preClass}"><code id="${id}">${textSafe}</code></pre>
          <button class="${ui.buttonSecondary} copy" type="button" data-copy-source="${id}" aria-label="${label}">Copy</button>
        </div>`;
}

export function renderSetupPage(): string {
  const ui = staticSurfaceClassNames;
  const mcpUrl = getPublicMcpUrl();
  const appUrl = getPublicAppUrl();
  const docsUrl = getPublicDocsUrl();
  const connectUrl = `${appUrl}${CONNECT_GENFEED_PATH}`;
  const docsGuideUrl = `${docsUrl}${DOCS_GUIDE_PATH}`;
  const oauthDocsUrl = `${docsGuideUrl}#connect-via-oauth`;
  const postHogSnippet = renderPostHogSnippet();

  const mcpUrlSafe = escapeHtml(mcpUrl);
  const connectUrlSafe = escapeHtml(connectUrl);
  const docsUrlSafe = escapeHtml(docsUrl);
  const docsGuideUrlSafe = escapeHtml(docsGuideUrl);
  const oauthDocsUrlSafe = escapeHtml(oauthDocsUrl);

  const claudeUrlSafe = escapeHtml(getPublicClaudeMcpUrl());
  const claude = buildConnectGenfeedInstructions(
    'claude-code',
    getPublicClaudeMcpUrl(),
  );
  const codex = buildConnectGenfeedInstructions('codex', mcpUrl);
  const generic = buildConnectGenfeedInstructions('generic', mcpUrl);
  const chatPrompt = buildConnectGenfeedChatPrompt(mcpUrl);

  const claudeCommandSafe = escapeHtml(claude.primaryCommand ?? '');
  const codexCommandSafe = escapeHtml(codex.primaryCommand ?? '');
  const genericConfigSafe = escapeHtml(generic.configuration);
  const genericAuthSafe = escapeHtml(generic.authorizationInstruction);
  const chatPromptSafe = escapeHtml(chatPrompt);
  const agentSetupPromptSafe = escapeHtml(
    buildAgentSetupPrompt({ apiKeysUrl: connectUrl, mcpUrl }),
  );
  const mcpUrlInlineScriptLiteral = toInlineScriptStringLiteral(mcpUrl);

  const toolsetOptions = getUserVisibleToolsetSummaries()
    .map((toolset) => {
      const nameSafe = escapeHtml(toolset.name);
      const descriptionSafe = escapeHtml(toolset.description);
      const toolCountLabel = `${toolset.toolCount} tool${toolset.toolCount === 1 ? '' : 's'}`;
      return `<label class="toolset-option">
          <input type="checkbox" data-toolset-checkbox data-toolset="${nameSafe}" ${toolset.isAlwaysOn ? 'checked disabled' : ''} />
          <span class="toolset-name">${nameSafe}${toolset.isAlwaysOn ? ' <span class="toolset-always-on">(always on)</span>' : ''}</span>
          <span class="toolset-count">${toolCountLabel}</span>
          <span class="toolset-desc">${descriptionSafe}</span>
        </label>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en" class="${ui.root}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<meta name="description" content="Connect Claude, ChatGPT, Cursor, Gemini, Meta Muse, Grok Bot, and other AI agents to Genfeed over MCP with browser OAuth — no API key required." />
<title>Genfeed MCP Server — connect any AI agent</title>
<style>
/* Self-hosted Satoshi (the product's sans). One variable face covers 300-900,
   so the MCP page renders in the same brand type as the marketing site and app
   with no CDN, no extra route, no editorial serif. */
@font-face {
  font-family: "Satoshi";
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url("data:font/woff2;base64,${SATOSHI_VARIABLE_WOFF2_BASE64}") format("woff2");
}
${staticSurfaceCss}
* { box-sizing: border-box; }
html { min-height: 100%; background: var(--gf-bg-primary); }
body {
  min-height: 100vh;
  margin: 0;
  background: var(--gf-bg-primary);
  color: var(--gf-text-primary);
  font-family: var(--gf-font-sans);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
}
body::before {
  position: fixed;
  inset: 0;
  z-index: -2;
  background-image:
    linear-gradient(var(--gf-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--gf-grid-line) 1px, transparent 1px);
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
  max-width: 680px;
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
  margin: 18px 0 0;
  color: var(--gf-text-primary);
  font-family: var(--gf-font-sans);
  font-size: 56px;
  font-weight: 600;
  line-height: 1.03;
  letter-spacing: -0.03em;
}
.lede {
  max-width: 560px;
  margin: 20px 0 0;
  color: var(--gf-text-muted);
  font-size: 14px;
  line-height: 1.8;
}
.hero-endpoint {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 620px;
  margin-top: 28px;
}
.hero-endpoint .endpoint-code {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--gf-text-primary);
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}
.copy {
  flex-shrink: 0;
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
  font-family: var(--gf-font-sans);
  font-size: 42px;
  font-weight: 600;
  line-height: 1.02;
  letter-spacing: -0.03em;
}
.section-title em {
  color: var(--gf-text-muted);
  font-style: normal;
  font-weight: 600;
}
.section-copy {
  margin: 0;
  color: var(--gf-text-muted);
  font-size: 14px;
  line-height: 1.8;
}
.section-copy a {
  color: var(--gf-text-secondary);
  text-decoration: underline;
}
.section-copy a:hover { color: var(--gf-text-primary); }
.tablist {
  display: flex;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--gf-border);
  scrollbar-width: none;
}
.tab {
  flex: 0 0 auto;
  min-height: 46px;
  white-space: nowrap;
  border: 0;
  border-right: 1px solid var(--gf-border);
  background: transparent;
  color: var(--gf-text-muted);
  padding: 0 16px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
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
  font-family: var(--gf-font-sans);
  font-size: 27px;
  font-weight: 600;
  letter-spacing: -0.025em;
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
  border-bottom: 1px solid var(--gf-divider-subtle);
  padding: 24px 0;
}
.step > div {
  min-width: 0;
}
.step:last-child { border-bottom: 0; }
.step-number {
  color: var(--gf-text-faint);
  font-family: var(--gf-font-sans);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
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
.code-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 12px;
}
.code-row pre {
  min-width: 0;
  flex: 1 1 auto;
  margin: 0;
}
.prompt-block {
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
}
.toolsets-section {
  padding: 44px 0;
}
.toolsets summary {
  cursor: pointer;
  color: var(--gf-text-primary);
  font-size: 13px;
  font-weight: 750;
  list-style: none;
}
.toolsets summary::-webkit-details-marker { display: none; }
.toolsets summary::before {
  display: inline-block;
  margin-right: 8px;
  color: var(--gf-text-faint);
  content: "▸";
  transition: transform 150ms ease-out;
}
.toolsets[open] summary::before {
  transform: rotate(90deg);
}
.toolsets .section-copy {
  margin: 14px 0 20px;
}
.toolset-picker {
  display: grid;
  gap: 4px;
}
.toolset-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  column-gap: 12px;
  row-gap: 4px;
  align-items: baseline;
  border-bottom: 1px solid var(--gf-divider-subtle);
  padding: 10px 0;
  cursor: pointer;
}
.toolset-option:last-child { border-bottom: 0; }
.toolset-option input[type="checkbox"] {
  align-self: center;
}
.toolset-name {
  color: var(--gf-text-primary);
  font-size: 12px;
  font-weight: 750;
}
.toolset-always-on {
  color: var(--gf-text-faint);
  font-weight: 600;
}
.toolset-count {
  color: var(--gf-text-faint);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.toolset-desc {
  grid-column: 2 / -1;
  margin: 0;
  color: var(--gf-text-muted);
  font-size: 12px;
}
.site-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 36px 0 44px;
  color: var(--gf-text-faint);
  font-size: 11px;
}
.footer-note {
  max-width: 560px;
  margin: 0;
  line-height: 1.6;
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
  .section-head {
    grid-template-columns: 1fr;
  }
  .hero h1 { font-size: 46px; }
}
@media (max-width: 640px) {
  .page { width: min(100vw - 24px, 1120px); }
  .site-nav { align-items: flex-start; padding: 12px 0; }
  .nav-links { gap: 10px; }
  .nav-link { display: none; }
  .hero { padding: 44px 0 48px; }
  .hero h1 { font-size: 36px; }
  .hero-endpoint { gap: 8px; }
  .section { padding: 56px 0; }
  .toolsets-section { padding: 36px 0; }
  .section-title { font-size: 34px; }
  .tabpanel { padding: 0 16px 4px; }
  .tablist { flex-wrap: wrap; }
  .tab {
    flex: 1 1 100%;
    border-bottom: 1px solid var(--gf-border);
    padding: 0 10px;
  }
  .code-row { gap: 8px; }
  .step { grid-template-columns: 1fr; gap: 8px; }
  .step-number { font-size: 26px; }
  .site-footer { grid-template-columns: 1fr; }
  .footer-links { justify-content: flex-start; }
}
</style>
${postHogSnippet}
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
      <a class="${ui.buttonPrimary}" href="${connectUrlSafe}" rel="noopener noreferrer">Connect Genfeed</a>
    </div>
  </nav>

  <header class="hero">
    <p class="eyebrow">MCP server</p>
    <h1>Connect any AI agent to Genfeed.</h1>
    <p class="lede">Draft, schedule and measure content through your AI client. Claude uses your brands and existing assets; create images, video and audio in Genfeed Studio. Other clients can also generate through MCP.</p>
    <div class="hero-endpoint">
      <div class="${ui.codeBlock} endpoint-code" id="mcp-url">${mcpUrlSafe}</div>
      <button class="${ui.buttonSecondary} copy" type="button" id="mcp-url-copy" data-copy="${mcpUrlSafe}" aria-label="Copy MCP endpoint">Copy</button>
    </div>
    <div class="hero-actions">
      <a class="${ui.buttonPrimary}" href="${connectUrlSafe}" rel="noopener noreferrer">Start guided setup</a>
      <a class="${ui.buttonSecondary}" href="${docsGuideUrlSafe}" rel="noopener noreferrer">Read MCP docs</a>
    </div>
  </header>

  <section class="section" aria-labelledby="setup-title">
    <div class="section-head">
      <div>
        <p class="section-kicker">Setup</p>
        <h2 class="section-title" id="setup-title">One server. <em>Any client.</em></h2>
      </div>
      <p class="section-copy">Add Genfeed to your client and approve access in your browser. No API key is required. Need more detail? Read the <a href="${oauthDocsUrlSafe}" rel="noopener noreferrer">OAuth setup guide</a>. For the CLI, run <code class="${ui.inlineCode}">genfeed login</code> and approve in the browser — do not paste a secret.</p>
    </div>

    <div class="${ui.card}">
      <div class="tablist" role="tablist" aria-label="Client setup instructions">
        <button class="tab" id="tab-claude-code" type="button" role="tab" aria-selected="true" aria-controls="panel-claude-code" data-tab="claude-code">Claude Code</button>
        <button class="tab" id="tab-claude-chat" type="button" role="tab" aria-selected="false" aria-controls="panel-claude-chat" data-tab="claude-chat">Claude &amp; Cowork</button>
        <button class="tab" id="tab-codex" type="button" role="tab" aria-selected="false" aria-controls="panel-codex" data-tab="codex">Codex</button>
        <button class="tab" id="tab-chat-agent" type="button" role="tab" aria-selected="false" aria-controls="panel-chat-agent" data-tab="chat-agent">Muse &amp; Grok Bot</button>
        <button class="tab" id="tab-other-clients" type="button" role="tab" aria-selected="false" aria-controls="panel-other-clients" data-tab="other-clients">Other clients</button>
        <button class="tab" id="tab-agent-prompt" type="button" role="tab" aria-selected="false" aria-controls="panel-agent-prompt" data-tab="agent-prompt">Agent prompt</button>
      </div>

      <section class="tabpanel is-active" id="panel-claude-code" role="tabpanel" aria-labelledby="tab-claude-code" data-panel="claude-code">
        <div class="setup-title-row">
          <h3 class="instruction-title">Claude Code setup</h3>
          <span class="${ui.badge}">HTTP transport</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Add the MCP server</p>
              <p class="step-copy">Registers the Claude connector in user scope with browser OAuth. Use brands, drafts, scheduling and analytics here; create media in Genfeed Studio.</p>
              ${renderCommandBlock({ id: 'claude-code-command', label: 'Copy Claude Code command', textSafe: claudeCommandSafe, ui })}
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Authorize and verify</p>
              <p class="step-copy">Open <code class="${ui.inlineCode}">/mcp</code> in Claude Code, select genfeed, and sign in. Then ask it to list your Genfeed brands.</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="tabpanel" id="panel-claude-chat" role="tabpanel" aria-labelledby="tab-claude-chat" data-panel="claude-chat">
        <h3 class="instruction-title">Claude and Cowork setup</h3>
        <p class="step-copy">Add a custom connector in Claude with the URL below and complete browser OAuth. Use it for brands, drafts, scheduling and analytics. Create images, video and audio in Genfeed Studio. Reconnect existing installations with this URL. Genfeed is not yet listed in the public Claude directory.</p>
        ${renderCommandBlock({ id: 'claude-chat-url', label: 'Copy Claude connector URL', textSafe: claudeUrlSafe, ui })}
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
              <p class="step-title">Add the MCP server</p>
              <p class="step-copy">The CLI and IDE share <code class="${ui.inlineCode}">~/.codex/config.toml</code>. No bearer-token variable needed.</p>
              ${renderCommandBlock({ id: 'codex-command', label: 'Copy Codex command', textSafe: codexCommandSafe, ui })}
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Authorize and verify</p>
              <p class="step-copy">If browser authorization did not open during setup, run this. Approve access, then ask Codex to list your Genfeed brands.</p>
              ${renderCommandBlock({ id: 'codex-login-command', label: 'Copy Codex login command', textSafe: 'codex mcp login genfeed', ui })}
            </div>
          </li>
        </ol>
      </section>

      <section class="tabpanel" id="panel-chat-agent" role="tabpanel" aria-labelledby="tab-chat-agent" data-panel="chat-agent">
        <div class="setup-title-row">
          <h3 class="instruction-title">Muse &amp; Grok Bot</h3>
          <span class="${ui.badge}">Chat-built connector</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Paste this prompt</p>
              <p class="step-copy">Meta Muse and Grok Bot can build their own MCP connector directly from a chat prompt.</p>
              ${renderCommandBlock({ id: 'chat-agent-prompt', label: 'Copy chat agent prompt', multiline: true, textSafe: chatPromptSafe, ui })}
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Approve in your browser</p>
              <p class="step-copy">Approve the sign-in link it sends back. Never share a password, token, or API key in the chat.</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="tabpanel" id="panel-other-clients" role="tabpanel" aria-labelledby="tab-other-clients" data-panel="other-clients">
        <div class="setup-title-row">
          <h3 class="instruction-title">Other MCP clients</h3>
          <span class="${ui.badge}">ChatGPT, Cursor, Gemini</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Add this server configuration</p>
              <p class="step-copy">Paste this into your client's remote MCP server settings.</p>
              ${renderCommandBlock({ id: 'generic-client-config', label: 'Copy client configuration', multiline: true, textSafe: genericConfigSafe, ui })}
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Authorize and verify</p>
              <p class="step-copy">${genericAuthSafe} Then ask your agent to list your Genfeed brands.</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="tabpanel" id="panel-agent-prompt" role="tabpanel" aria-labelledby="tab-agent-prompt" data-panel="agent-prompt">
        <div class="setup-title-row">
          <h3 class="instruction-title">AI agent setup prompt</h3>
          <span class="${ui.badge}">Copy/paste</span>
        </div>
        <ol class="steps">
          <li class="step">
            <span class="step-number">01</span>
            <div>
              <p class="step-title">Give this to a local shell agent</p>
              <p class="step-copy">Drop this into Claude Code, Codex, or another local agent with shell access. It installs the playbook for your selected client, configures Genfeed, starts browser authorization, and verifies access with read-only calls.</p>
              <p class="step-copy">For non-Claude clients only, run this command and select your client. Skip it if a Genfeed plugin already includes the playbook. Claude Code uses the dedicated Genfeed plugin; other Claude clients connect with OAuth. Do not install this skills bundle into any Claude client. Skills alone do not connect or authenticate MCP.</p>
              ${renderCommandBlock({ id: 'skills-install-command', label: 'Copy skills install command', textSafe: escapeHtml(GENFEED_SKILLS_INSTALL_COMMAND), ui })}
              ${renderCommandBlock({ id: 'agent-setup-prompt', label: 'Copy agent setup prompt', multiline: true, textSafe: agentSetupPromptSafe, ui })}
            </div>
          </li>
          <li class="step">
            <span class="step-number">02</span>
            <div>
              <p class="step-title">Complete sign-in in your browser</p>
              <p class="step-copy">You approve access yourself. Copying this prompt does not authorize your client.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </section>

  <section class="section toolsets-section" aria-label="Advanced toolset configuration">
    <details class="toolsets">
      <summary>Advanced: limit which toolsets load</summary>
      <p class="section-copy">For the standard connector only; Claude has a fixed catalog and does not accept these selectors. Narrow <code class="${ui.inlineCode}">tools/list</code> to just the toolsets your agent needs. Leave everything unchecked for the default profile on the bare URL, or add <code class="${ui.inlineCode}">?profile=full</code> for every tool.</p>
      <div class="${ui.card}">
        <div class="toolset-picker" role="group" aria-label="Toolsets to include">
          ${toolsetOptions}
        </div>
      </div>
    </details>
  </section>

  <footer class="site-footer">
    <p class="footer-note">Claude requires browser OAuth. Other clients can use the manual API-key fallback in guided setup. For the CLI, run <code class="${ui.inlineCode}">genfeed login</code>. Keep tokens out of shared logs.</p>
    <div class="footer-links">
      <a href="${docsUrlSafe}" rel="noopener noreferrer">Documentation</a>
      <a href="${docsGuideUrlSafe}" rel="noopener noreferrer">MCP guide</a>
      <a href="/v1/config" rel="noopener noreferrer">Config</a>
      <a href="/v1/health" rel="noopener noreferrer">Health</a>
      <a href="https://genfeed.ai" rel="noopener noreferrer">genfeed.ai</a>
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

  // Toolset picker: rewrites every rendered snippet that embeds the MCP
  // endpoint when the caller narrows (or widens) the selected toolsets.
  // Nothing selected (besides the always-on, disabled "core" box) means the
  // plain URL. The server treats that as the default profile, not the full
  // catalog. ?profile=full is the explicit full-catalog URL.
  (function () {
    var baseMcpUrl = ${mcpUrlInlineScriptLiteral};

    function shellQuote(url) {
      return /^[A-Za-z0-9:/._-]+$/.test(url)
        ? url
        : "'" + url.replace(/'/g, "'\\\\''") + "'";
    }

    // Pure URL builder. The base is the protected-resource identifier, which
    // never carries a query string or fragment (the shared resolver rejects
    // them), so "?toolsets=" is always the first and only query parameter.
    function joinToolsetsUrl(baseUrl, selected) {
      if (selected.length === 0) return baseUrl;
      return baseUrl + '?toolsets=' + selected.join(',');
    }

    var currentUrl = baseMcpUrl;
    var currentShellUrl = shellQuote(baseMcpUrl);

    function computeUrl() {
      var selected = Array.prototype.slice
        .call(document.querySelectorAll('[data-toolset-checkbox]:checked'))
        .map(function (el) { return el.getAttribute('data-toolset'); })
        .filter(function (name) { return name && name !== 'core'; });
      return joinToolsetsUrl(baseMcpUrl, selected);
    }

    function replaceAll(text, needle, replacement) {
      return needle ? text.split(needle).join(replacement) : text;
    }

    // The AI setup prompt embeds the endpoint twice: plainly (the "Endpoint:"
    // line, and inside JSON/TOML config blocks, where quoting is unaffected
    // by shell rules) and inside the Claude Code / Codex shell commands it
    // quotes for. Rewriting it must match: the shell-command occurrences need
    // the shell-quoted URL, exactly like the dedicated command snippets get,
    // while every other occurrence stays plain. nextUrl is always baseMcpUrl
    // plus an appended query string, so it has currentUrl as a literal
    // prefix — swapping the shell-quoted occurrences in first and THEN doing
    // the plain replace would let the plain pass re-match (and re-append to)
    // the currentUrl prefix it just inserted. A placeholder shields the
    // already-rewritten shell occurrences from that second pass; it is
    // substituted back for the real shell-quoted URL last.
    function rewriteAgentPrompt(text, currentUrl, currentShellUrl, nextUrl, nextShellUrl) {
      var placeholder = '__GENFEED_TOOLSET_URL_PLACEHOLDER__';
      var claudeUrl = currentUrl.split('?')[0] + '/claude';
      var claudePlaceholder = '__GENFEED_CLAUDE_URL_PLACEHOLDER__';
      text = replaceAll(text, claudeUrl, claudePlaceholder);
      var next = replaceAll(
        text,
        '--scope user ' + currentShellUrl,
        '--scope user ' + placeholder,
      );
      next = replaceAll(next, '--url ' + currentShellUrl, '--url ' + placeholder);
      next = replaceAll(next, currentUrl, nextUrl);
      next = replaceAll(next, placeholder, nextShellUrl);
      return replaceAll(next, claudePlaceholder, claudeUrl);
    }

    function applyUrl(nextUrl) {
      var nextShellUrl = shellQuote(nextUrl);

      // Blocks that only ever embed the endpoint as plain text (never inside
      // a shell-quoted command): the endpoint display, the chat-agent prompt
      // (Muse/Grok Bot), and the generic client JSON config.
      ['mcp-url', 'chat-agent-prompt', 'generic-client-config'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = replaceAll(el.textContent || '', currentUrl, nextUrl);
      });

      var promptEl = document.getElementById('agent-setup-prompt');
      if (promptEl) {
        promptEl.textContent = rewriteAgentPrompt(
          promptEl.textContent || '',
          currentUrl,
          currentShellUrl,
          nextUrl,
          nextShellUrl,
        );
      }

      ['codex-command'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = replaceAll(
          el.textContent || '',
          currentShellUrl,
          nextShellUrl,
        );
      });

      var copyButton = document.getElementById('mcp-url-copy');
      if (copyButton) {
        var current = copyButton.getAttribute('data-copy') || '';
        copyButton.setAttribute('data-copy', replaceAll(current, currentUrl, nextUrl));
      }

      currentUrl = nextUrl;
      currentShellUrl = nextShellUrl;
    }

    document.querySelectorAll('[data-toolset-checkbox]').forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        applyUrl(computeUrl());
      });
    });
  })();
</script>
</body>
</html>`;
}
