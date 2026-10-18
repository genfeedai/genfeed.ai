import {
  SATOSHI_FONT_RESOURCE_PATH,
  staticSurfaceFontCssForUrl,
} from '@genfeedai/ui/static/font';
import { ACCOUNT_AVATAR_ORIGINS } from '@mcp/ui/avatar-origins';
import { cardAppScript } from '@mcp/ui/card-app-script';
import { CARD_APP_STYLES } from '@mcp/ui/card-app-styles';
import {
  MCP_APP_MIME_TYPE,
  MCP_CARD_RESOURCE_HASH,
  MCP_CARD_RESOURCE_URI,
  safeCardUrl,
} from '@mcp/ui/card-data';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

/**
 * Whether a browser iframe can load media from this URL. A plain-http or
 * internal-network origin (the files service address behind the API) is
 * mixed content in the host page and is not a valid CSP source for it.
 */
function isBrowserOrigin(url: string): boolean {
  const { hostname, protocol } = new URL(url);
  return (
    protocol === 'https:' ||
    (protocol === 'http:' && LOOPBACK_HOSTS.has(hostname))
  );
}

export function cardResource(
  origins: readonly string[] = ['https://cdn.genfeed.ai'],
  fontUrl = `https://mcp.genfeed.ai${SATOSHI_FONT_RESOURCE_PATH}?v=${MCP_CARD_RESOURCE_HASH}`,
) {
  const mediaOrigins = [
    ...new Set(
      origins.flatMap((value) => {
        const url = safeCardUrl(value);
        return url && isBrowserOrigin(url) ? [new URL(url).origin] : [];
      }),
    ),
  ];
  const resourceDomains = [
    ...new Set([
      ...mediaOrigins,
      ...ACCOUNT_AVATAR_ORIGINS,
      new URL(fontUrl).origin,
    ]),
  ];
  return {
    _meta: {
      ui: { csp: { connectDomains: [], resourceDomains }, prefersBorder: true },
    },
    mimeType: MCP_APP_MIME_TYPE,
    text: cardHtml(mediaOrigins, fontUrl),
    uri: MCP_CARD_RESOURCE_URI,
  };
}

function cardHtml(mediaOrigins: string[], fontUrl: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genfeed content</title><style>
${staticSurfaceFontCssForUrl(fontUrl)}
${CARD_APP_STYLES}
</style></head><body class="gf-app"><main id="app" aria-label="Content cards"></main>
<script>${cardAppScript(mediaOrigins)}</script></body></html>`;
}
