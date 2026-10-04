/** How often a pending media job is re-read, and for how long at most. */
const JOB_POLL_INTERVAL_MS = 5000;
const JOB_POLL_MAX_ATTEMPTS = 60;

/**
 * The view's client: a self-contained MCP Apps bridge (JSON-RPC over
 * postMessage, no CDN script) that renders `structuredContent.genfeedCards`
 * as a content calendar, post previews, or media players. All user text is
 * assigned through textContent; media loads only from the CSP origins.
 */
export function cardAppScript(origins: readonly string[]): string {
  const domains = JSON.stringify(origins).replace(/</g, '\\u003c');
  return `
(() => {
  const origins = ${domains};
  const root = document.getElementById('cards');
  const notice = document.getElementById('notice');
  const summary = document.getElementById('summary');
  const pending = new Map();
  const pollTimers = new Set();
  let nextId = 1;
  let isInitialized = false;
  let isDisposed = false;
  let displayModes = [];
  let observer;
  let resizeFrame;
  let lightbox;
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
    resizeFrame = requestAnimationFrame(() => send({ method: 'ui/notifications/size-changed', params: { height: Math.ceil(document.body.getBoundingClientRect().height) } }));
  }
  function applyContext(context) {
    if (!context) return;
    if (['light', 'dark'].includes(context.theme)) document.body.dataset.theme = context.theme;
    if (Array.isArray(context.availableDisplayModes)) displayModes = context.availableDisplayModes;
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
  function formatDate(value, options) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, options);
  }
  function openLink(url) {
    request('ui/open-link', { url: url.href }).then(result => { if (result && result.isError) throw new Error('blocked'); }).catch(() => { notice.textContent = 'The host could not open the link. Copy the link address to open it in your browser.'; resize(); });
  }
  function linkTo(url, label) {
    const link = element('a', '', label);
    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.addEventListener('click', event => { event.preventDefault(); openLink(url); });
    return link;
  }
  function description(item, container) {
    if (!item.description) return;
    if (item.description.length > 500 && item.kind !== 'usage') {
      container.append(element('p', 'description', item.description.slice(0, 280) + '…'));
      const details = element('details'); details.append(element('summary', '', 'Read more'), element('p', 'description', item.description)); details.addEventListener('toggle', resize); container.append(details);
    } else container.append(element('p', item.kind === 'usage' ? 'metric' : 'description', item.description));
  }
  function closeLightbox() {
    if (!lightbox) return;
    const trigger = lightbox.trigger;
    lightbox.remove(); lightbox = undefined;
    document.removeEventListener('keydown', onLightboxKey);
    if (displayModes.includes('fullscreen')) request('ui/request-display-mode', { mode: 'inline' }).catch(() => undefined);
    if (trigger) trigger.focus();
    resize();
  }
  function onLightboxKey(event) { if (event.key === 'Escape') closeLightbox(); }
  function openLightbox(src, alt, trigger) {
    closeLightbox();
    lightbox = element('div', 'lightbox');
    lightbox.setAttribute('role', 'dialog'); lightbox.setAttribute('aria-modal', 'true'); lightbox.setAttribute('aria-label', alt);
    lightbox.trigger = trigger;
    const image = element('img'); image.src = src; image.alt = alt; image.referrerPolicy = 'no-referrer';
    const close = element('button', 'close', 'Close'); close.type = 'button';
    close.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
    lightbox.append(image, close); document.body.append(lightbox);
    document.addEventListener('keydown', onLightboxKey);
    if (displayModes.includes('fullscreen')) request('ui/request-display-mode', { mode: 'fullscreen' }).catch(() => undefined);
    close.focus(); resize();
  }
  function mediaElement(item, copy) {
    const preview = mediaUrl(item.url) || (item.kind === 'image' ? mediaUrl(item.thumbnailUrl) : null);
    if (!preview) return null;
    let media;
    let wrapper;
    if (item.kind === 'image') {
      media = element('img'); media.alt = item.title || 'Generated image'; media.loading = 'lazy'; media.referrerPolicy = 'no-referrer';
      wrapper = element('button', 'zoom'); wrapper.type = 'button'; wrapper.setAttribute('aria-label', 'Enlarge ' + media.alt);
      wrapper.addEventListener('click', () => openLightbox(preview, media.alt, wrapper));
      wrapper.append(media);
    } else if (['video', 'audio'].includes(item.kind)) {
      media = element(item.kind); media.controls = true; media.preload = 'metadata';
      if (item.kind === 'video') { media.playsInline = true; const poster = mediaUrl(item.thumbnailUrl); if (poster) media.poster = poster; }
    } else return null;
    media.src = preview;
    media.addEventListener('error', () => { (wrapper || media).remove(); copy.append(element('p', 'notice', 'Preview unavailable. Open the media link to view it.')); resize(); }, { once: true });
    media.addEventListener('load', resize); media.addEventListener('loadedmetadata', resize);
    return wrapper || media;
  }
  function pendingElement(item) {
    const box = element('div', 'pending');
    box.append(element('div', 'meta', item.stage || 'Generating'));
    const bar = element('div', typeof item.progress === 'number' ? 'bar' : 'bar indeterminate');
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Generation progress');
    if (typeof item.progress === 'number') { bar.setAttribute('aria-valuenow', String(item.progress)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.style.setProperty('--progress', item.progress + '%'); }
    bar.append(element('span'));
    box.append(bar, element('p', 'notice', 'This preview updates when the job finishes.'));
    return box;
  }
  function pollJob(item, article, attempt) {
    if (isDisposed || !item.id || attempt >= ${JOB_POLL_MAX_ATTEMPTS}) return;
    const timer = setTimeout(() => {
      pollTimers.delete(timer);
      request('tools/call', { name: 'get_job_status', arguments: { jobId: item.id } }).then(result => {
        const view = result && result.structuredContent && result.structuredContent.genfeedCards;
        const next = view && Array.isArray(view.cards) && view.cards[0];
        if (!next || isDisposed || !article.isConnected) return pollJob(item, article, attempt + 1);
        // The fresh card replaces the old one outright: a finished job has no isPending.
        const replacement = renderMediaCard({ ...next, id: next.id || item.id }, attempt + 1);
        article.replaceWith(replacement); resize();
      }).catch(() => pollJob(item, article, attempt + 1));
    }, ${JOB_POLL_INTERVAL_MS});
    pollTimers.add(timer);
  }
  function renderMediaCard(item, attempt = 0) {
    const article = element('article', 'card');
    const copy = element('div', 'copy');
    if (item.isPending) article.append(pendingElement(item));
    else { const media = mediaElement(item, copy); if (media) article.append(media); }
    copy.append(element('div', 'meta', [item.kind, item.platform, item.status].filter(Boolean).join(' · ')));
    copy.append(element('h2', '', item.title));
    description(item, copy);
    if (item.date) { const label = formatDate(item.date); if (label) { const time = element('time', 'notice', label); time.dateTime = new Date(item.date).toISOString(); copy.append(time); } }
    if (item.id) copy.append(element('p', 'id', item.id));
    const url = safeUrl(item.url) || (item.kind === 'image' ? safeUrl(item.thumbnailUrl) : null);
    if (url) copy.append(linkTo(url, ['post', 'article'].includes(item.kind) ? 'Open published content ↗' : 'Open media ↗'));
    article.append(copy);
    if (item.isPending) pollJob(item, article, attempt);
    return article;
  }
  function renderPost(item) {
    const article = element('article', 'card post');
    const head = element('div', 'post-head');
    const platform = item.platform || 'Post';
    head.append(element('span', 'avatar', platform.charAt(0).toUpperCase()));
    const who = element('div', 'who'); who.append(element('strong', '', platform.charAt(0).toUpperCase() + platform.slice(1)));
    const when = formatDate(item.date, { dateStyle: 'medium', timeStyle: 'short' });
    if (when) who.append(element('span', '', when));
    head.append(who);
    if (item.status) head.append(element('span', 'status', item.status));
    article.append(head);
    const body = element('div', 'post-body');
    if (item.title && item.title !== 'Post') body.append(element('h2', '', item.title));
    description(item, body);
    article.append(body);
    const copy = element('div', 'copy');
    const media = mediaElement(item, copy);
    if (media) { const frame = element('div', 'media-frame'); frame.append(media); article.append(frame); }
    const url = safeUrl(item.url);
    if (url) copy.append(linkTo(url, 'Open published post ↗'));
    if (copy.childNodes.length) article.append(copy);
    return article;
  }
  function renderCalendar(view) {
    const calendar = view.calendar || { days: [], draftsCount: 0 };
    root.className = 'calendar';
    const gaps = calendar.days.filter(day => day.isGap).length;
    summary.replaceChildren(
      element('span', 'pill', view.total + ' scheduled'),
      element('span', 'pill', gaps + (gaps === 1 ? ' open day' : ' open days')),
      element('span', 'pill', calendar.draftsCount + (calendar.draftsCount === 1 ? ' draft' : ' drafts')),
    );
    const today = new Date().toISOString().slice(0, 10);
    calendar.days.forEach(day => {
      const section = element('section', 'day' + (day.isGap ? ' gap' : '') + (day.date === today ? ' today' : ''));
      const date = new Date(day.date + 'T12:00:00Z');
      const head = element('div', 'day-head');
      head.append(element('span', '', date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })), element('strong', '', date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })));
      section.setAttribute('aria-label', date.toLocaleDateString(undefined, { dateStyle: 'full', timeZone: 'UTC' }));
      section.append(head);
      if (day.isGap) section.append(element('p', 'gap-label', 'Nothing scheduled'));
      day.posts.forEach(post => {
        const slot = element('div', 'slot');
        slot.append(element('div', 'meta', [formatDate(post.date, { timeStyle: 'short' }), post.platform].filter(Boolean).join(' · ')));
        slot.append(element('p', '', post.description || post.title));
        section.append(slot);
      });
      root.append(section);
    });
    notice.textContent = calendar.days.length ? '' : 'No days in this calendar window.';
  }
  function clearPolls() { for (const timer of pollTimers) clearTimeout(timer); pollTimers.clear(); }
  function render(result) {
    if (isDisposed) return;
    clearPolls(); closeLightbox();
    root.replaceChildren(); root.className = ''; summary.replaceChildren(); document.getElementById('footer').textContent = '';
    const view = result && result.structuredContent && result.structuredContent.genfeedCards;
    if (!result || result.isError || !view || !Array.isArray(view.cards)) {
      const content = result && Array.isArray(result.content) ? result.content : [];
      notice.textContent = content.filter(part => part.type === 'text').map(part => part.text).join(String.fromCharCode(10)) || 'No preview is available. The tool result remains available in the conversation.';
      resize(); return;
    }
    document.getElementById('title').textContent = view.title || 'Genfeed content';
    if (view.layout === 'calendar') { renderCalendar(view); resize(); return; }
    root.className = view.layout === 'posts' ? 'posts' : '';
    notice.textContent = view.cards.length ? '' : 'No content found.';
    view.cards.slice(0, 24).forEach(item => {
      if (!item || typeof item !== 'object') return;
      root.append(view.layout === 'posts' && item.kind === 'post' ? renderPost(item) : renderMediaCard(item));
    });
    document.getElementById('footer').textContent = view.total > view.cards.length ? 'Showing ' + view.cards.length + ' of ' + view.total + '. Ask for more or narrow your search.' : '';
    resize();
  }
  function dispose() {
    if (observer) observer.disconnect(); cancelAnimationFrame(resizeFrame); clearPolls(); closeLightbox();
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
    else if (message.method === 'ui/notifications/tool-input') { if (!root.childElementCount) { notice.textContent = 'Working on it…'; resize(); } }
    else if (message.method === 'ui/notifications/tool-cancelled') { clearPolls(); root.replaceChildren(); notice.textContent = 'Request cancelled.'; resize(); }
    else if (message.method === 'ui/notifications/host-context-changed') applyContext(message.params);
    else if (message.method === 'ui/resource-teardown' && message.id !== undefined) { send({ id: message.id, result: {} }); dispose(); }
    else if (message.method === 'ping' && message.id !== undefined) send({ id: message.id, result: {} });
    else if (message.id !== undefined && message.method) send({ id: message.id, error: { code: -32601, message: 'Method not supported' } });
  }
  window.addEventListener('message', onMessage);
  request('ui/initialize', { appInfo: { name: 'Genfeed content cards', version: '2.0.0' }, appCapabilities: {}, protocolVersion: '2026-01-26' }).then(result => {
    if (isDisposed) return;
    applyContext(result.hostContext); isInitialized = true;
    send({ method: 'ui/notifications/initialized', params: {} });
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(resize); observer.observe(document.body); }
    resize();
  }).catch(() => { if (!isDisposed) notice.textContent = 'This client could not initialize the preview. Use the tool result in the conversation.'; });
})();
`;
}
