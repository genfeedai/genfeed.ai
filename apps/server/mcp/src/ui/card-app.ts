import { staticSurfaceCss } from '@genfeedai/ui/static/surface';
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
  const domains = JSON.stringify(resourceDomains).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Genfeed content</title><style>
${staticSurfaceCss}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--gf-bg-primary);font-family:var(--gf-font-sans)}
header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:16px}h1{font-size:16px;margin:0;text-transform:capitalize}.brand{font-size:12px;color:var(--gf-text-muted)}
#cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}.card{border:1px solid var(--gf-border);background:var(--gf-bg-secondary);overflow:hidden;min-width:0}
.copy{padding:16px}h2{font-size:15px;line-height:1.4;margin:8px 0;overflow-wrap:anywhere}.meta{font-size:11px;color:var(--gf-text-muted);text-transform:uppercase;letter-spacing:.04em}.description{font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0}.id{font-size:11px;overflow-wrap:anywhere;color:var(--gf-text-muted)}
img,video{display:block;width:100%;max-height:380px;object-fit:contain;background:var(--gf-bg-tertiary)}audio{width:100%;margin-top:12px}.metric{font-size:30px;font-variant-numeric:tabular-nums}.notice{font-size:13px;color:var(--gf-text-muted);white-space:pre-wrap;overflow-wrap:anywhere}a{color:var(--gf-text-primary);font-size:12px;text-underline-offset:3px}a:focus-visible{outline:2px solid var(--gf-text-primary);outline-offset:4px}
footer{margin-top:12px}details summary{cursor:pointer;font-size:12px}details .description{max-height:280px;overflow:auto}
</style></head><body class="gf-ui"><header><h1 id="title">Genfeed content</h1><span class="brand">GENFEED</span></header>
<p id="notice" class="notice" role="status" aria-live="polite">Loading content…</p><main id="cards" aria-label="Content cards"></main><footer id="footer" class="notice"></footer>
<script>
(() => {
  const origins = ${domains};
  const root = document.getElementById('cards');
  const notice = document.getElementById('notice');
  const pending = new Map();
  let nextId = 1;
  let isInitialized = false;
  let isDisposed = false;
  let observer;
  let resizeFrame;
  function send(message) { if (!isDisposed) window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*'); }
  function request(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('The host did not respond.')); }, 10000);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }
  function resize() {
    if (!isInitialized || isDisposed) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => send({ method: 'ui/notifications/size-changed', params: { height: document.documentElement.scrollHeight } }));
  }
  function theme(context) {
    if (context && ['light', 'dark'].includes(context.theme)) document.body.dataset.theme = context.theme;
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (typeof text === 'string') el.textContent = text;
    return el;
  }
  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null; } catch { return null; }
  }
  function mediaUrl(value) { const url = safeUrl(value); return url && origins.includes(url.origin) ? url.href : null; }
  function renderCard(item) {
    const article = element('article', 'card');
    const copy = element('div', 'copy');
    const url = safeUrl(item.url);
    const preview = mediaUrl(item.url);
    let media;
    if (preview && item.kind === 'image') {
      media = element('img'); media.alt = item.title || 'Generated image'; media.loading = 'lazy'; media.referrerPolicy = 'no-referrer';
    } else if (preview && ['video', 'audio'].includes(item.kind)) {
      media = element(item.kind); media.controls = true; media.preload = 'none';
      if (item.kind === 'video') { media.playsInline = true; const poster = mediaUrl(item.thumbnailUrl); if (poster) media.poster = poster; }
    }
    if (media) {
      media.src = preview;
      media.addEventListener('error', () => { media.remove(); copy.append(element('p', 'notice', 'Preview unavailable. Open the media link to view it.')); resize(); }, { once: true });
      media.addEventListener('load', resize); media.addEventListener('loadedmetadata', resize);
      article.append(media);
    }
    copy.append(element('div', 'meta', [item.kind, item.platform, item.status].filter(Boolean).join(' · ')));
    copy.append(element('h2', '', item.title));
    if (item.description) {
      if (item.description.length > 500 && item.kind !== 'usage') {
        copy.append(element('p', 'description', item.description.slice(0, 280) + '…'));
        const details = element('details'); details.append(element('summary', '', 'Read more'), element('p', 'description', item.description)); details.addEventListener('toggle', resize); copy.append(details);
      } else copy.append(element('p', item.kind === 'usage' ? 'metric' : 'description', item.description));
    }
    if (item.date) { const date = new Date(item.date); if (!Number.isNaN(date.getTime())) { const time = element('time', 'notice', date.toLocaleString()); time.dateTime = date.toISOString(); copy.append(time); } }
    if (item.id) copy.append(element('p', 'id', item.id));
    if (url) {
      const link = element('a', '', ['post', 'article'].includes(item.kind) ? 'Open published content ↗' : 'Open media ↗');
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.addEventListener('click', event => { event.preventDefault(); request('ui/open-link', { url: url.href }).catch(() => { notice.textContent = 'The host could not open the link. Copy the link address to open it in your browser.'; resize(); }); });
      copy.append(link);
    }
    article.append(copy); return article;
  }
  function render(result) {
    if (isDisposed) return;
    root.replaceChildren(); document.getElementById('footer').textContent = '';
    const view = result && result.structuredContent && result.structuredContent.genfeedCards;
    if (!result || result.isError || !view || !Array.isArray(view.cards)) {
      const content = result && Array.isArray(result.content) ? result.content : [];
      notice.textContent = content.filter(part => part.type === 'text').map(part => part.text).join('\\n') || 'No preview is available. The tool result remains available in the conversation.';
      resize(); return;
    }
    document.getElementById('title').textContent = view.title || 'Genfeed content';
    notice.textContent = view.cards.length ? '' : 'No content found.';
    view.cards.slice(0, 24).forEach(item => { if (item && typeof item === 'object') root.append(renderCard(item)); });
    document.getElementById('footer').textContent = view.total > view.cards.length ? 'Showing ' + view.cards.length + ' of ' + view.total + '. Ask for more or narrow your search.' : '';
    resize();
  }
  function dispose() {
    if (observer) observer.disconnect(); cancelAnimationFrame(resizeFrame);
    document.querySelectorAll('video,audio').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); });
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('View closed.')); } pending.clear();
    window.removeEventListener('message', onMessage); isDisposed = true;
  }
  function onMessage(event) {
    if (event.source !== window.parent || !event.data || event.data.jsonrpc !== '2.0') return;
    const message = event.data;
    if (message.id !== undefined && pending.has(message.id) && !message.method) {
      const entry = pending.get(message.id); clearTimeout(entry.timer); pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.result); return;
    }
    if (message.method === 'ui/notifications/tool-result') render(message.params);
    else if (message.method === 'ui/notifications/tool-cancelled') { root.replaceChildren(); notice.textContent = 'Request cancelled.'; resize(); }
    else if (message.method === 'ui/notifications/host-context-changed') theme(message.params);
    else if (message.method === 'ui/resource-teardown' && message.id !== undefined) { send({ id: message.id, result: {} }); dispose(); }
    else if (message.method === 'ping' && message.id !== undefined) send({ id: message.id, result: {} });
    else if (message.id !== undefined && message.method) send({ id: message.id, error: { code: -32601, message: 'Method not supported' } });
  }
  window.addEventListener('message', onMessage);
  request('ui/initialize', { appInfo: { name: 'Genfeed content cards', version: '1.0.0' }, appCapabilities: {}, protocolVersion: '2026-01-26' }).then(result => {
    if (isDisposed) return;
    theme(result.hostContext); isInitialized = true;
    send({ method: 'ui/notifications/initialized', params: {} });
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(resize); observer.observe(document.body); }
    resize();
  }).catch(() => { if (!isDisposed) notice.textContent = 'This client could not initialize the preview. Use the tool result in the conversation.'; });
})();
</script></body></html>`;
}
