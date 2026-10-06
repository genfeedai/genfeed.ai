import { staticSurfaceFontCss } from '@genfeedai/ui/static/font';
import { cardAppScript } from '@mcp/ui/card-app-script';
import { CARD_APP_STYLES } from '@mcp/ui/card-app-styles';
import {
  MCP_APP_MIME_TYPE,
  MCP_CARD_RESOURCE_URI,
  safeCardUrl,
} from '@mcp/ui/card-data';

export function cardResource(
  origins: readonly string[] = ['https://cdn.genfeed.ai'],
) {
  const resourceDomains = [
    ...new Set(
      origins.flatMap((value) => {
        const url = safeCardUrl(value);
        return url ? [new URL(url).origin] : [];
      }),
    ),
  ];
  return {
    _meta: {
      ui: { csp: { connectDomains: [], resourceDomains }, prefersBorder: true },
    },
    mimeType: MCP_APP_MIME_TYPE,
    text: cardHtml(resourceDomains),
    uri: MCP_CARD_RESOURCE_URI,
  };
}

function cardHtml(resourceDomains: string[]): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genfeed content</title><style>
${staticSurfaceFontCss}
${CARD_APP_STYLES}
</style></head><body class="gf-app"><main id="app" aria-label="Content cards"></main>
<script>${cardAppScript(resourceDomains)}</script></body></html>`;
}
