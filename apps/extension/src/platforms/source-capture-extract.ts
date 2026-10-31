import type {
  RawMediaCandidate,
  RawSourceCapture,
  SourceCaptureHost,
  SourceCaptureRequest,
} from '~models/imported-source.model';

/**
 * Runs inside the page (content script or `chrome.scripting.executeScript`),
 * so it must stay self-contained: no imports other than types, no module
 * scope references. It reads only what the user can see, never forms, hidden
 * elements or editable fields, and never follows a link or fetches media.
 */
export function extractSourceCapture(
  request: SourceCaptureRequest,
): RawSourceCapture {
  const TEXT_LIMIT = 100_000;
  const FORBIDDEN =
    'script,style,noscript,template,iframe,object,embed,form,input,textarea,select,option,[hidden],[inert],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"]),[data-private],[data-sensitive]';
  const PLAYER_FRAME =
    /^https?:\/\/(?:[\w-]+\.)*(?:youtube(?:-nocookie)?\.com\/embed|player\.vimeo\.com|open\.spotify\.com\/embed|embed\.podcasts\.apple\.com|w\.soundcloud\.com|player\.twitch\.tv)/i;
  const AUDIO_LINK = /\.(?:mp3|m4a|aac|ogg|oga|wav)(?:$|[?#])/i;

  const hostName = location.hostname.toLowerCase().replace(/^www\./, '');
  const host: SourceCaptureHost | undefined = /(^|\.)(x|twitter)\.com$/.test(
    hostName,
  )
    ? 'x'
    : /(^|\.)reddit\.com$/.test(hostName)
      ? 'reddit'
      : /(^|\.)youtube\.com$/.test(hostName)
        ? 'youtube'
        : /(^|\.)(instagram|tiktok|linkedin|facebook)\.com$/.test(hostName)
          ? 'social'
          : undefined;

  const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim();
  const meta = (selector: string): string | undefined => {
    const value = clean(
      document.querySelector<HTMLMetaElement>(selector)?.content,
    );
    return value || undefined;
  };
  const isShown = (element: Element | null): boolean => {
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0'
      )
        return false;
    }
    return true;
  };
  const absolute = (value: string | null | undefined): string | undefined => {
    const raw = clean(value);
    if (!raw) return undefined;
    try {
      return new URL(raw, location.href).href;
    } catch {
      return undefined;
    }
  };

  const selection = window.getSelection();
  // Only an explicit selection capture reads the selection; a page capture
  // never silently narrows to whatever text happened to be highlighted.
  const range =
    request.scope === 'selection' && selection?.rangeCount
      ? selection.getRangeAt(0)
      : null;
  let isSelection = false;

  const textWithin = (root: Element, within: Range | null): string => {
    const chunks: string[] = [];
    let length = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(FORBIDDEN) ||
          (within && !within.intersectsNode(node)) ||
          !isShown(parent)
        )
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = node.textContent ?? '';
      if (within?.startContainer === node)
        text = text.slice(within.startOffset);
      if (within?.endContainer === node)
        text = text.slice(
          0,
          within.endOffset -
            (within.startContainer === node ? within.startOffset : 0),
        );
      text = text.trim();
      if (!text) continue;
      chunks.push(text);
      length += text.length + 1;
      if (length > TEXT_LIMIT)
        throw new Error(
          'This page exceeds the capture limit. Select a shorter passage.',
        );
    }
    return chunks.join('\n');
  };

  const media: RawMediaCandidate[] = [];
  const addMedia = (candidate: RawMediaCandidate): void => {
    if (
      candidate.url &&
      !media.some(
        (item) => item.url === candidate.url && item.kind === candidate.kind,
      )
    )
      media.push(candidate);
  };

  // Structured data: types, author and playable media URLs.
  const typeHints: string[] = [];
  let ldAuthor: string | undefined;
  const readLd = (value: unknown, depth = 0): void => {
    if (depth > 6 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) readLd(item, depth + 1);
      return;
    }
    const node = value as Record<string, unknown>;
    const types = node['@type'];
    for (const type of Array.isArray(types) ? types : [types])
      if (typeof type === 'string') typeHints.push(type.toLowerCase());
    const author = node.author;
    if (!ldAuthor) {
      const first = Array.isArray(author) ? author[0] : author;
      const name =
        typeof first === 'string'
          ? first
          : first && typeof first === 'object'
            ? (first as Record<string, unknown>).name
            : undefined;
      if (typeof name === 'string' && clean(name)) ldAuthor = clean(name);
    }
    const typeText = [types].flat().join(' ').toLowerCase();
    const kind = /audio|podcast/.test(typeText)
      ? 'audio'
      : /video/.test(typeText)
        ? 'video'
        : null;
    if (kind) {
      const content = absolute(
        typeof node.contentUrl === 'string' ? node.contentUrl : undefined,
      );
      const embed = absolute(
        typeof node.embedUrl === 'string' ? node.embedUrl : undefined,
      );
      if (content)
        addMedia({
          kind,
          label: clean(typeof node.name === 'string' ? node.name : ''),
          origin: 'structured-data',
          url: content,
        });
      else if (embed)
        addMedia({
          kind,
          label: clean(typeof node.name === 'string' ? node.name : ''),
          origin: 'player',
          url: embed,
        });
    }
    for (const child of Object.values(node)) readLd(child, depth + 1);
  };
  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      readLd(JSON.parse(script.textContent ?? ''));
    } catch {
      // Malformed structured data is ignored; the visible page still captures.
    }
  }
  const ogType = meta('meta[property="og:type"]');
  if (ogType) typeHints.push(ogType.toLowerCase());

  let title = '';
  let text = '';
  let author: string | undefined;
  let authorHandle: string | undefined;
  let externalIdentity: string | undefined;
  let canonicalUrl =
    absolute(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ) ?? absolute(meta('meta[property="og:url"]'));
  let limitation: string | undefined;

  const fallbackTitle = (): string =>
    meta('meta[property="og:title"]') ??
    meta('meta[name="twitter:title"]') ??
    clean(document.title);

  const onlyMetadata = (reason: string): void => {
    limitation = reason;
    title = fallbackTitle();
    text = '';
    // A host page for a social network can show an authenticated timeline.
    // Without a single post (or a user selection) only the link is captured.
    canonicalUrl = undefined;
  };

  const captureX = (): void => {
    const status = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!status) {
      onlyMetadata('Open a single post to save it.');
      return;
    }
    const [, pathUser, tweetId] = status;
    const articles = [
      ...document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    ];
    const article =
      articles.find((item) =>
        item.querySelector(`a[href*="/status/${tweetId}"]`),
      ) ?? null;
    externalIdentity = tweetId;
    canonicalUrl = `https://x.com/${pathUser}/status/${tweetId}`;
    if (!article) {
      limitation = 'This post is not visible yet. Wait for it to load.';
      title = fallbackTitle();
      return;
    }
    const body = article.querySelector('[data-testid="tweetText"]');
    text = body ? textWithin(body, range) : '';
    isSelection = Boolean(range && text);
    const name = article.querySelector('[data-testid="User-Name"]');
    author = clean(name?.querySelector('a')?.textContent) || undefined;
    authorHandle = pathUser !== 'i' ? pathUser : undefined;
    title = text ? clean(text).slice(0, 120) : `Post by ${author ?? pathUser}`;
    for (const image of article.querySelectorAll<HTMLImageElement>(
      '[data-testid="tweetPhoto"] img',
    )) {
      const url = absolute(image.currentSrc || image.src);
      if (url && /^https:/.test(url))
        addMedia({
          kind: 'image',
          label: clean(image.alt) || 'Post image',
          origin: 'element',
          url,
        });
    }
    if (article.querySelector('[data-testid="videoPlayer"], video'))
      addMedia({
        kind: 'video',
        label: 'Post video',
        origin: 'player',
        url: canonicalUrl,
      });
  };

  const captureReddit = (): void => {
    const comments = location.pathname.match(/\/comments\/([a-z0-9]+)/i);
    const post = document.querySelector<HTMLElement>(
      'shreddit-post, .thing.link',
    );
    if (!comments || !post) {
      onlyMetadata('Open a single post to save it.');
      return;
    }
    const attribute = (name: string): string | undefined =>
      clean(post.getAttribute(name)) || undefined;
    externalIdentity = comments[1];
    const permalink = attribute('permalink') ?? attribute('data-permalink');
    canonicalUrl =
      absolute(permalink ? `https://www.reddit.com${permalink}` : undefined) ??
      `https://www.reddit.com/comments/${comments[1]}`;
    title =
      attribute('post-title') ??
      clean(post.querySelector('a.title')?.textContent) ??
      fallbackTitle();
    authorHandle = attribute('author') ?? attribute('data-author') ?? undefined;
    author = authorHandle;
    const body = post.querySelector('[slot="text-body"], .usertext-body');
    text = body ? textWithin(body, range) : '';
    isSelection = Boolean(range && text);
    for (const image of post.querySelectorAll<HTMLImageElement>(
      '[slot="post-media-container"] img, .expando img',
    )) {
      const url = absolute(image.currentSrc || image.src);
      if (url && /^https:/.test(url))
        addMedia({
          kind: 'image',
          label: clean(image.alt) || 'Post image',
          origin: 'element',
          url,
        });
    }
    if (post.querySelector('shreddit-player, video'))
      addMedia({
        kind: 'video',
        label: 'Post video',
        origin: 'player',
        url: canonicalUrl,
      });
  };

  const captureYouTube = (): void => {
    const videoId =
      location.pathname === '/watch'
        ? new URLSearchParams(location.search).get('v')
        : (location.pathname.match(/^\/shorts\/([\w-]{6,})/)?.[1] ?? null);
    if (!videoId) {
      onlyMetadata('Open a video to save it.');
      return;
    }
    externalIdentity = videoId;
    canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    title =
      clean(
        document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata')
          ?.textContent,
      ) ||
      meta('meta[property="og:title"]') ||
      clean(document.title).replace(/ - YouTube$/, '');
    const channel = document.querySelector<HTMLAnchorElement>(
      'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a, #channel-name a',
    );
    author = clean(channel?.textContent) || undefined;
    authorHandle =
      channel?.getAttribute('href')?.match(/\/@([^/?#]+)/)?.[1] ?? undefined;
    // The public description is a page fact; the video itself is not captured.
    text = meta('meta[property="og:description"]') ?? '';
    addMedia({
      kind: 'video',
      label: 'YouTube video',
      origin: 'player',
      url: canonicalUrl,
    });
  };

  const captureGeneric = (): void => {
    title = fallbackTitle();
    author =
      meta('meta[name="author"]') ??
      (() => {
        const value = meta('meta[property="article:author"]');
        return value && !/^https?:/i.test(value) ? value : undefined;
      })() ??
      ldAuthor ??
      (clean(
        document.querySelector('[rel="author"], .byline, [itemprop="author"]')
          ?.textContent,
      ) ||
        undefined);
    const articles = [...document.querySelectorAll('article')];
    const root =
      articles.find((item) => clean(item.textContent).length > 200) ??
      document.querySelector('main, [role="main"]') ??
      document.body;
    // Saving one image, video or audio file does not read the page text.
    if (request.scope !== 'media') {
      text = range ? textWithin(document.body, range) : textWithin(root, null);
      isSelection = Boolean(range && text);
      if (!text) text = meta('meta[property="og:description"]') ?? '';
    }

    for (const element of root.querySelectorAll<HTMLMediaElement>(
      'video, audio',
    )) {
      if (!isShown(element)) continue;
      const kind = element.tagName === 'AUDIO' ? 'audio' : 'video';
      const sources = [
        element.currentSrc || element.getAttribute('src'),
        ...[...element.querySelectorAll('source')].map((source) =>
          source.getAttribute('src'),
        ),
      ];
      for (const source of sources) {
        const url = absolute(source);
        if (url)
          addMedia({
            kind,
            label: clean(element.getAttribute('title')),
            origin: 'element',
            url,
          });
      }
    }
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(
      'iframe[src]',
    )) {
      const url = absolute(frame.getAttribute('src'));
      if (url && PLAYER_FRAME.test(url) && isShown(frame))
        addMedia({
          kind: /spotify|podcasts\.apple|soundcloud/i.test(url)
            ? 'audio'
            : 'video',
          label: clean(frame.getAttribute('title')),
          origin: 'player',
          url,
        });
    }
    for (const property of [
      'meta[property="og:video"]',
      'meta[property="og:video:url"]',
      'meta[property="og:video:secure_url"]',
    ]) {
      const url = absolute(meta(property));
      if (url)
        addMedia({
          kind: 'video',
          label: 'Page video',
          origin: 'meta',
          url,
        });
    }
    for (const property of [
      'meta[property="og:audio"]',
      'meta[property="og:audio:secure_url"]',
    ]) {
      const url = absolute(meta(property));
      if (url)
        addMedia({
          kind: 'audio',
          label: 'Page audio',
          origin: 'meta',
          url,
        });
    }
    let linked = 0;
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
      'a[href]',
    )) {
      if (linked >= 3) break;
      const url = absolute(anchor.getAttribute('href'));
      if (url && AUDIO_LINK.test(url) && isShown(anchor)) {
        linked += 1;
        addMedia({
          kind: 'audio',
          label: clean(anchor.textContent) || 'Audio file',
          origin: 'link',
          url,
        });
      }
    }
    let images = 0;
    for (const image of root.querySelectorAll<HTMLImageElement>('img[src]')) {
      if (images >= 6) break;
      const width = image.naturalWidth || Number(image.getAttribute('width'));
      const url = absolute(image.currentSrc || image.src);
      if (
        !url ||
        !/^https?:/.test(url) ||
        image.getAttribute('aria-hidden') === 'true' ||
        image.getAttribute('role') === 'presentation' ||
        (width > 0 && width < 160) ||
        !isShown(image)
      )
        continue;
      images += 1;
      addMedia({
        kind: 'image',
        label: clean(image.alt) || 'Page image',
        origin: 'element',
        url,
      });
    }
    const preview = absolute(meta('meta[property="og:image"]'));
    if (preview)
      addMedia({
        kind: 'image',
        label: 'Page preview image',
        origin: 'meta',
        url: preview,
      });
  };

  if (request.scope === 'link') {
    const target = absolute(request.targetUrl) ?? location.href;
    return {
      media: [],
      scope: 'link',
      text: '',
      isSelection: false,
      title: clean(new URL(target).hostname),
      typeHints: [],
      url: target,
    };
  }

  if (host === 'x') captureX();
  else if (host === 'reddit') captureReddit();
  else if (host === 'youtube') captureYouTube();
  else if (host === 'social')
    onlyMetadata('Select the passage you want to save, or save the link.');
  else captureGeneric();

  // A selection on a social host replaces the post text, never the timeline.
  if (host && range && !text) {
    const selected = textWithin(document.body, range);
    if (selected) {
      text = selected;
      isSelection = true;
      limitation = undefined;
    }
  }

  if (request.scope === 'media') {
    const target = absolute(request.targetUrl);
    if (target) {
      media.unshift({
        kind: request.mediaKind ?? 'image',
        label: 'Selected media',
        origin: 'selected',
        url: target,
      });
    }
  }

  return {
    author,
    authorHandle,
    canonicalUrl,
    externalIdentity,
    host,
    isSelection,
    limitation,
    media,
    scope: request.scope,
    siteName: meta('meta[property="og:site_name"]'),
    text: text.slice(0, TEXT_LIMIT),
    title,
    typeHints: [...new Set(typeHints)],
    url: location.href,
  };
}
