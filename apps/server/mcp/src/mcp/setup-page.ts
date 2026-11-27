import process from 'node:process';
import {
  API_KEY_SCOPE_PRESETS,
  MCP_CLAUDE_SCOPE_CEILING,
} from '@genfeedai/contracts/constants';
import type { McpResourceIdentifierResolution } from '@genfeedai/contracts/interfaces';
import {
  CONNECT_CLIENTS,
  type ConnectClientEntry,
  type ConnectClientMarkId,
  type ConnectClientTabId,
} from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';
import {
  buildConnectSetupGuide,
  splitConnectSetupText,
} from '@genfeedai/helpers/integrations/connect-genfeed-setup-guide.helper';
import {
  deriveMcpResourceIdentifierForMode,
  getMcpSupportedScopes,
  OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH,
  resolveMcpResourceIdentifier,
} from '@genfeedai/helpers/integrations/mcp-resource.helper';
import { escapeHtml } from '@genfeedai/helpers/security/escape-html.helper';
import type { McpAccessMode } from '@genfeedai/mcp-kit';
import { staticSurfaceFontCss } from '@genfeedai/ui/static/font';
import {
  staticSurfaceClassNames,
  staticSurfaceCss,
} from '@genfeedai/ui/static/surface';
import { CLIENT_LOGO_PATH_PREFIX } from './client-logos';
import {
  getMcpServerInfo,
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_NAME,
} from './server-identity';
import { renderCommandBlock } from './setup-page-command-block';

const TRAILING_SLASHES_PATTERN = /\/+$/;
const TRAILING_SLASH_PATTERN = /\/$/;
const POSTHOG_PROJECT_KEY_PATTERN = /^phc_[A-Za-z0-9]+$/;

const DEFAULT_APP_URL = 'https://app.genfeed.ai';
const DEFAULT_API_URL = 'https://api.genfeed.ai';
const DEFAULT_DOCS_URL = 'https://docs.genfeed.ai';
const DEFAULT_WEBSITE_URL = 'https://genfeed.ai';
const DEFAULT_MCP_URL = 'https://mcp.genfeed.ai/mcp';
const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';
const CONNECT_GENFEED_PATH = '/connectors';
const DOCS_GUIDE_PATH = '/api-reference/mcp';
const SETUP_PAGE_TITLE = 'Genfeed MCP Server — connect any AI agent';
const SETUP_PAGE_DESCRIPTION =
  'Connect Claude, ChatGPT, Cursor, Gemini, Grok, Meta Muse, and other AI agents to Genfeed over MCP with browser OAuth — no API key required.';
// The website composes this card (apps/marketing marketing-og.data.ts); every
// Genfeed surface shares its 1200x630 layout.
const SETUP_PAGE_OG_IMAGE_PATH = '/og/mcp';

export type SetupTabId = ConnectClientTabId;

/** Tabs come from the shared client list the in-app Connect flow also reads. */
const SETUP_TABS = CONNECT_CLIENTS;
type SetupTab = ConnectClientEntry;

const DEFAULT_SETUP_TAB_ID: SetupTabId = 'claude';

/**
 * Maps a request path to the setup tab it opens. `/` and `/docs` open the
 * first tab; each tab also has its own route so a client's setup can be
 * shared by URL. Returns null for any other path.
 */
export function resolveSetupPageTab(pathname: string): SetupTabId | null {
  const path =
    pathname.length > 1
      ? pathname.replace(TRAILING_SLASHES_PATTERN, '')
      : pathname;
  if (path === '/' || path === '/docs') {
    return DEFAULT_SETUP_TAB_ID;
  }
  return SETUP_TABS.find((tab) => tab.path === path)?.id ?? null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(TRAILING_SLASH_PATTERN, '');
}

function readEnv(name: string): string | undefined {
  return process.env[name];
}

function renderPostHogSnippet(): string {
  const projectToken = readEnv('POSTHOG_PROJECT_API_KEY');
  if (!projectToken || !POSTHOG_PROJECT_KEY_PATTERN.test(projectToken)) {
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

function getOAuthIssuerUrl(): string {
  return readFirstPublicUrl(
    ['GENFEEDAI_API_PUBLIC_URL', 'GENFEEDAI_API_URL'],
    DEFAULT_API_URL,
  );
}

export function getPublicMcpResourceMetadataUrl(
  mode: McpAccessMode = 'standard',
): string {
  const path =
    mode === 'standard'
      ? OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH
      : `${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${new URL(deriveMcpResourceIdentifierForMode(getPublicMcpUrl(), mode)).pathname}`;
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
    resource: deriveMcpResourceIdentifierForMode(getPublicMcpUrl(), mode),
    resource_documentation: `${getPublicDocsUrl()}/api-reference/mcp`,
    resource_name: 'Genfeed',
    resource_policy_uri: `${getPublicWebsiteUrl()}/privacy`,
    resource_tos_uri: `${getPublicWebsiteUrl()}/terms`,
    // Discovery includes optional permissions. The challenge above requests
    // the default scopes so a Brand Kit grant still requires a brand choice
    // and explicit consent.
    scopes_supported: getMcpSupportedScopes(mode),
  };
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
    protocolVersion: '2026-07-28',
    serverInfo,
    transport: {
      endpoint: getPublicMcpUrl(),
      type: 'streamable-http',
    },
    version: '1.0',
  };
}

function getPublicDocsUrl(): string {
  return readPublicUrl('GENFEED_DOCS_URL', DEFAULT_DOCS_URL);
}

/** The operator's public website; its /privacy and /terms are advertised. */
export function getPublicWebsiteUrl(): string {
  return readPublicUrl('GENFEEDAI_PUBLIC_URL', DEFAULT_WEBSITE_URL);
}

export function getPublicAppUrl(): string {
  return readPublicUrl('GENFEED_APP_URL', DEFAULT_APP_URL);
}

function renderTabLogos(logos: readonly ConnectClientMarkId[]): string {
  if (logos.length === 0) return '';
  const images = logos
    .map(
      (logo) =>
        `<span class="client-logo client-logo-${logo}"><img src="${CLIENT_LOGO_PATH_PREFIX}${logo}.svg" alt="" width="14" height="14" /></span>`,
    )
    .join('');
  return `<span class="tab-logos" aria-hidden="true">${images}</span>`;
}

export function renderSetupPage(
  activeTabId: SetupTabId = DEFAULT_SETUP_TAB_ID,
): string {
  const ui = staticSurfaceClassNames;
  const activeTab =
    SETUP_TABS.find((tab) => tab.id === activeTabId) ?? SETUP_TABS[0];
  const isDefaultTab = activeTab.id === DEFAULT_SETUP_TAB_ID;
  const pageTitle = (tab: SetupTab): string =>
    tab.id === DEFAULT_SETUP_TAB_ID
      ? SETUP_PAGE_TITLE
      : `${tab.label} setup — Genfeed MCP Server`;
  const activePageTitleSafe = escapeHtml(pageTitle(activeTab));
  const tabsMarkup = SETUP_TABS.map((tab) => {
    const isActive = tab.id === activeTab.id;
    return `<a class="tab" id="tab-${tab.id}" href="${tab.path}" role="tab" aria-selected="${isActive}" aria-controls="panel-${tab.id}" data-tab="${tab.id}" data-title="${escapeHtml(pageTitle(tab))}">${renderTabLogos(tab.marks)}${escapeHtml(tab.label)}</a>`;
  }).join('\n        ');
  const panelClass = (id: SetupTabId): string =>
    id === activeTab.id ? 'tabpanel is-active' : 'tabpanel';
  const mcpUrl = getPublicMcpUrl();
  const appUrl = getPublicAppUrl();
  const docsUrl = getPublicDocsUrl();
  const connectUrl = `${appUrl}${CONNECT_GENFEED_PATH}`;
  const ogImageUrlSafe = escapeHtml(
    `${getPublicWebsiteUrl()}${SETUP_PAGE_OG_IMAGE_PATH}`,
  );
  const mcpOriginSafe = escapeHtml(new URL(mcpUrl).origin);
  const docsGuideUrl = `${docsUrl}${DOCS_GUIDE_PATH}`;
  const oauthDocsUrl = `${docsGuideUrl}#connect-via-oauth`;
  const postHogSnippet = renderPostHogSnippet();

  const mcpUrlSafe = escapeHtml(mcpUrl);
  const connectUrlSafe = escapeHtml(connectUrl);
  const docsUrlSafe = escapeHtml(docsUrl);
  const docsGuideUrlSafe = escapeHtml(docsGuideUrl);
  const oauthDocsUrlSafe = escapeHtml(oauthDocsUrl);

  const renderInlineText = (value: string): string =>
    splitConnectSetupText(value)
      .map((segment) =>
        segment.isCode
          ? `<code class="${ui.inlineCode}">${escapeHtml(segment.text)}</code>`
          : escapeHtml(segment.text),
      )
      .join('');
  const renderGuidePanel = (tab: SetupTab): string => {
    const guide = buildConnectSetupGuide(tab.id, { connectUrl, mcpUrl });
    const steps = guide.steps
      .map((step, index) => {
        const parts = step.parts
          .map((part) =>
            part.kind === 'text'
              ? `<p class="step-copy">${renderInlineText(part.text)}</p>`
              : renderCommandBlock({
                  id: part.id,
                  label: part.label,
                  multiline: part.isMultiline,
                  textSafe: escapeHtml(part.text),
                  ui,
                }),
          )
          .join('\n              ');
        return `<li class="step">
            <span class="step-number">${String(index + 1).padStart(2, '0')}</span>
            <div>
              <p class="step-title">${escapeHtml(step.title)}</p>
              ${parts}
            </div>
          </li>`;
      })
      .join('\n          ');
    const badge = guide.badge
      ? `<span class="${ui.badge}">${escapeHtml(guide.badge)}</span>`
      : '';
    return `<section class="${panelClass(tab.id)}" id="panel-${tab.id}" role="tabpanel" aria-labelledby="tab-${tab.id}" data-panel="${tab.id}">
        <div class="setup-title-row">
          <h3 class="instruction-title">${escapeHtml(guide.title)}</h3>
          ${badge}
        </div>
        <ol class="steps">
          ${steps}
        </ol>
      </section>`;
  };
  const panelsMarkup = SETUP_TABS.map(renderGuidePanel).join('\n\n      ');

  return `<!doctype html>
<html lang="en" class="${ui.root}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<meta name="description" content="${SETUP_PAGE_DESCRIPTION}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Genfeed.ai" />
<meta property="og:title" content="${activePageTitleSafe}" />
<meta property="og:description" content="${SETUP_PAGE_DESCRIPTION}" />
<meta property="og:url" content="${mcpOriginSafe}${isDefaultTab ? '' : activeTab.path}" />
<meta property="og:image" content="${ogImageUrlSafe}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${activePageTitleSafe}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@genfeedai" />
<meta name="twitter:title" content="${activePageTitleSafe}" />
<meta name="twitter:description" content="${SETUP_PAGE_DESCRIPTION}" />
<meta name="twitter:image" content="${ogImageUrlSafe}" />
<title>${activePageTitleSafe}</title>
<style>
${staticSurfaceFontCss}
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
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
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
.tab:hover { color: var(--gf-text-primary); }
.tab-logos {
  display: inline-flex;
  gap: 4px;
}
.client-logo {
  display: inline-grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 5px;
  background: #fff;
  color-scheme: light;
}
.client-logo-grok { background: #050505; }
.client-logo img {
  display: block;
  width: 14px;
  height: 14px;
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
    <p class="lede">Draft, schedule, generate and measure content through your AI client.</p>
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
        ${tabsMarkup}
      </div>

      ${panelsMarkup}
    </div>
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
      if (active) {
        tab.removeAttribute('tabindex');
        if (tab.getAttribute('data-title')) {
          document.title = tab.getAttribute('data-title');
        }
      } else {
        tab.tabIndex = -1;
      }
    });
    document.querySelectorAll('[role="tabpanel"][data-panel]').forEach(function (panel) {
      panel.classList.toggle('is-active', panel.getAttribute('data-panel') === next);
    });
  }

  // Each tab is a real link to its own route, so the URL is shareable and the
  // page works without JavaScript. With JavaScript the tab switches in place
  // and the address bar follows via the History API.
  function selectTab(tab) {
    setActiveTab(tab.getAttribute('data-tab') || 'claude');
    window.history.pushState(null, '', tab.getAttribute('href'));
  }

  document.querySelectorAll('[role="tab"][data-tab]').forEach(function (tab) {
    tab.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      selectTab(tab);
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
      selectTab(tabs[nextIndex]);
    });
  });

  // Links are all focusable without JavaScript; the script switches them to
  // roving tabindex (arrow keys move between tabs) once it runs.
  var initialTab = document.querySelector('[role="tab"][aria-selected="true"]');
  if (initialTab) setActiveTab(initialTab.getAttribute('data-tab'));

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', function () {
      var path = window.location.pathname.replace(/[/]+$/, '') || '/';
      var match = Array.prototype.slice
        .call(document.querySelectorAll('[role="tab"][data-tab]'))
        .filter(function (tab) { return tab.getAttribute('href') === path; })[0];
      setActiveTab(match ? match.getAttribute('data-tab') : 'claude');
    });
  }

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
