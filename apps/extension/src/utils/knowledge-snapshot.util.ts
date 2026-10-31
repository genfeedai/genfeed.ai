import type {
  CaptureMode,
  KnowledgeSnapshot,
} from '~models/knowledge-capture.model';

export const CAPTURE_TEXT_LIMIT = 200_000;
export const CAPTURE_BYTES_LIMIT = 800_000;

export function sanitizeCaptureUrl(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Choose an HTTP or HTTPS page to capture.');
  }
  url.username = '';
  url.password = '';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (
      /token|secret|password|passwd|auth|session|credential|cookie|signature|api.?key|^code$|^key$|^state$|^utm_/i.test(
        key,
      )
    ) {
      url.searchParams.delete(key);
    }
  }
  if (url.href.length > 2048) throw new Error('The source URL is too long.');
  return url.href;
}

export function sanitizeCaptureText(value: string): string {
  return value
    .replace(
      /<(script|style|noscript|template|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      '',
    )
    .replace(/<[^>]*>/g, '')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[redacted credential]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[redacted credential]',
    )
    .replace(
      /\b(?:sk|ghp|gho|github_pat)[-_][A-Za-z0-9_-]{16,}\b/g,
      '[redacted credential]',
    )
    .replace(
      /\b(password|passwd|secret|api.?key|access.?token|refresh.?token|authorization|cookie|session.?id)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    )
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
      try {
        return sanitizeCaptureUrl(url);
      } catch {
        return '[redacted URL]';
      }
    })
    .trim();
}

/** Runs inside the active tab. Keep this function self-contained for executeScript. */
export function extractKnowledgeSnapshot(
  mode: CaptureMode = 'page',
  targetUrl?: string,
): KnowledgeSnapshot {
  const forbidden =
    'script,style,noscript,template,iframe,object,embed,form,input,textarea,select,option,[hidden],[inert],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"]),[data-private],[data-sensitive]';
  const selection = window.getSelection();
  const range =
    mode === 'selection' && selection?.rangeCount
      ? selection.getRangeAt(0)
      : null;
  let root: Element = range
    ? document.body
    : (document.querySelector('main,article,[role="main"]') ?? document.body);
  if (mode === 'social' && targetUrl) {
    const target = new URL(targetUrl, location.href);
    const identity = (url: URL) =>
      url.pathname.match(
        /\/(?:status|comments|posts|video|p|reel)\/([^/]+)/,
      )?.[1] ??
      url.pathname.match(/activity[:-](\d+)/)?.[1] ??
      url.searchParams.get('story_fbid') ??
      url.searchParams.get('v');
    const host = (url: URL) =>
      url.hostname.replace(/^www\./, '').replace('twitter.com', 'x.com');
    const targetId = identity(target);
    const link = [
      ...document.querySelectorAll<HTMLAnchorElement>('a[href]'),
    ].find((item) => {
      try {
        const url = new URL(item.href);
        return (
          host(url) === host(target) &&
          (targetId
            ? identity(url) === targetId
            : url.pathname === target.pathname)
        );
      } catch {
        return false;
      }
    });
    const postSelector =
      'article,[role="article"],[data-testid="tweet"],[data-urn],.thing,shreddit-post,[data-testid="post-container"],[data-e2e="recommend-list-item-container"],ytd-watch-flexy';
    const post =
      link?.closest(postSelector) ??
      (targetId
        ? [...document.querySelectorAll(postSelector)].find((item) =>
            [
              item.getAttribute('data-urn'),
              item.getAttribute('post-id'),
              item.getAttribute('id'),
              item.getAttribute('data-post-id'),
            ].some((value) => value?.endsWith(targetId)),
          )
        : null);
    if (!post)
      throw new Error(
        'This post is not visible. Open it first, then capture it.',
      );
    root = post;
  }
  const chunks: string[] = [];
  let length = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest(forbidden) ||
        (range && !range.intersectsNode(node))
      )
        return NodeFilter.FILTER_REJECT;
      for (
        let element: Element | null = parent;
        element;
        element = element.parentElement
      ) {
        const style = getComputedStyle(element);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          style.opacity === '0'
        )
          return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  if (mode !== 'link') {
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = node.textContent ?? '';
      if (range?.startContainer === node) text = text.slice(range.startOffset);
      if (range?.endContainer === node)
        text = text.slice(
          0,
          range.endOffset -
            (range.startContainer === node ? range.startOffset : 0),
        );
      if (!text.trim()) continue;
      chunks.push(text.trim());
      length += text.length + 1;
      if (length > 200_000)
        throw new Error(
          'This page exceeds the capture limit. Select a shorter passage.',
        );
    }
  }
  if (mode === 'selection' && (!range || !chunks.length))
    throw new Error(
      'Select visible page text outside a form before capturing.',
    );
  return {
    mode,
    text: chunks.join('\n'),
    title: document.title,
    url: targetUrl ?? location.href,
  };
}

export function prepareKnowledgeSnapshot(
  snapshot: KnowledgeSnapshot,
): KnowledgeSnapshot {
  if (!['page', 'link', 'selection', 'social'].includes(snapshot.mode))
    throw new Error('Choose a supported capture type.');
  const result = {
    mode: snapshot.mode,
    title: sanitizeCaptureText(snapshot.title).slice(0, 500),
    text: sanitizeCaptureText(snapshot.text),
    url: snapshot.url ? sanitizeCaptureUrl(snapshot.url) : '',
  };
  if (!result.text && !result.url)
    throw new Error('Add text or a source URL to capture.');
  if (
    result.text.length > CAPTURE_TEXT_LIMIT ||
    new TextEncoder().encode(JSON.stringify(result)).length >
      CAPTURE_BYTES_LIMIT
  ) {
    throw new Error('This capture is too large. Select a shorter passage.');
  }
  return result;
}
