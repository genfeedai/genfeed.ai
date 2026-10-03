import type {
  PublicationCaptureAttempt,
  XPublicationCandidate,
  XPublicationComposer,
  XPublicationIdentity,
  XPublicationModalComposer,
  XPublicationReplyTarget,
} from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import {
  publicationCaptureHomeUrl,
  publicationCapturePageUrl,
  validPublicationCaptureIdentity,
} from '~services/publication-capture-validation';

const textOf = (element: HTMLElement) =>
  (element.innerText ?? element.textContent ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
export function isXHome(value: string): boolean {
  return Boolean(publicationCaptureHomeUrl(value));
}
export function isXPublicationPage(value: string): boolean {
  return Boolean(publicationCapturePageUrl(value));
}
function primary(element: Element, article: Element): boolean {
  for (
    let parent = element.parentElement;
    parent && parent !== article;
    parent = parent.parentElement
  )
    if (parent.matches('article,a,[role="link"]')) return false;
  return element.closest('article') === article;
}
function primaryHeader(article: Element): Element | null {
  if (!article.matches('article[data-testid="tweet"][role="article"]'))
    return null;
  const headers = [
    ...article.querySelectorAll('[data-testid="User-Name"]'),
  ].filter((element) => primary(element, article));
  if (headers.length !== 1) return null;
  const body = [...article.querySelectorAll('[data-testid="tweetText"]')].find(
    (element) => primary(element, article),
  );
  return body &&
    !(
      headers[0].compareDocumentPosition(body) &
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    ? null
    : headers[0];
}
function anchorUrl(anchor: HTMLAnchorElement): URL | null {
  try {
    return publicationCapturePageUrl(
      new URL(anchor.getAttribute('href') ?? '', anchor.ownerDocument.baseURI)
        .href,
    );
  } catch {
    return null;
  }
}
export function extractXPublicationIdentity(
  article: Element,
): XPublicationIdentity | null {
  const header = primaryHeader(article);
  if (!header) return null;
  const anchors = [...header.querySelectorAll<HTMLAnchorElement>('a[href]')];
  const profiles = anchors.flatMap((anchor) => {
    const url = anchorUrl(anchor);
    return url && /^\/[a-z0-9_]{1,15}$/i.test(url.pathname) ? [url] : [];
  });
  if (!profiles.length) return null;
  const authorHandle = profiles[0].pathname.slice(1).toLowerCase();
  if (
    profiles.some(
      (url) =>
        url.pathname.toLowerCase() !== `/${authorHandle}` ||
        url.origin !== profiles[0].origin,
    )
  )
    return null;
  const statuses = anchors.flatMap((anchor) => {
    const url = anchorUrl(anchor);
    const time = anchor
      .querySelector('time[datetime]')
      ?.getAttribute('datetime');
    return url &&
      new RegExp(`^/${authorHandle}/status/\\d+$`, 'i').test(url.pathname) &&
      time
      ? [{ url, time }]
      : [];
  });
  if (statuses.length !== 1) return null;
  const { url, time } = statuses[0];
  const externalId = url.pathname.split('/').at(-1) ?? '';
  if (
    !validPublicationCaptureIdentity(
      profiles[0].origin,
      externalId,
      url.href,
      authorHandle,
    ) ||
    !Number.isFinite(Date.parse(time))
  )
    return null;
  return { externalId, url: url.href, authorHandle, publicationDate: time };
}
export function extractXPublicationCandidate(
  article: Element,
): XPublicationCandidate | null {
  const identity = extractXPublicationIdentity(article);
  const header = primaryHeader(article);
  if (!identity || !header) return null;
  const bodies = [
    ...article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'),
  ].filter(
    (element) =>
      primary(element, article) &&
      Boolean(
        header.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  if (bodies.length !== 1) return null;
  const description = textOf(bodies[0]);
  return description ? { ...identity, description } : null;
}
export function findXPublicationComposer(
  document: Document,
): XPublicationComposer | null {
  const buttons = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="tweetButtonInline"]',
    ),
  ];
  const editors = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="tweetTextarea_0"][role="textbox"][contenteditable="true"]',
    ),
  ];
  if (buttons.length !== 1 || editors.length !== 1) return null;
  const submit = buttons[0],
    editor = editors[0];
  for (let root = submit.parentElement; root; root = root.parentElement) {
    if (root.closest('article,[role="dialog"]')) return null;
    if (
      root.contains(editor) &&
      root.querySelectorAll('[data-testid="tweetButtonInline"]').length === 1 &&
      root.querySelectorAll(
        '[data-testid="tweetTextarea_0"][role="textbox"][contenteditable="true"]',
      ).length === 1
    )
      return { root, editor, submit };
  }
  return null;
}
export function isTrustedXSubmission(
  isTrusted: boolean,
  target: EventTarget | null,
  composer: XPublicationComposer,
): boolean {
  return (
    isTrusted &&
    target instanceof Node &&
    composer.submit.contains(target) &&
    !composer.submit.hasAttribute('disabled') &&
    composer.submit.getAttribute('aria-disabled') !== 'true'
  );
}
function visible(element: HTMLElement): boolean {
  if (!element.isConnected || !element.getClientRects().length) return false;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      node.hidden ||
      node.getAttribute('aria-hidden') === 'true' ||
      style?.display === 'none' ||
      ['hidden', 'collapse'].includes(style?.visibility ?? '')
    )
      return false;
  }
  return true;
}
export function findXPublicationModalComposer(
  document: Document,
): XPublicationModalComposer | null {
  const dialogs = [
    ...document.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    ),
  ].filter(
    (dialog) =>
      visible(dialog) &&
      ![
        ...dialog.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"]',
        ),
      ].some(visible),
  );
  if (dialogs.length !== 1) return null;
  const dialog = dialogs[0];
  const inside = (element: HTMLElement) =>
    element.closest('[role="dialog"][aria-modal="true"]') === dialog &&
    visible(element);
  const editors = [
    ...dialog.querySelectorAll<HTMLElement>(
      '[data-testid="tweetTextarea_0"][role="textbox"][contenteditable="true"]',
    ),
  ].filter(inside);
  const submits = [
    ...dialog.querySelectorAll<HTMLElement>(
      '[data-testid="tweetButton"][role="button"]',
    ),
  ].filter(inside);
  if (editors.length !== 1 || submits.length !== 1) return null;
  const articles = [
    ...dialog.querySelectorAll('article[data-testid="tweet"][role="article"]'),
  ].filter(
    (article) =>
      article.closest('[role="dialog"][aria-modal="true"]') === dialog &&
      !article.parentElement?.closest('article'),
  );
  const label = textOf(submits[0]);
  const kind =
    articles.length === 0 && label === 'Post'
      ? 'post'
      : articles.length === 1 && label === 'Reply'
        ? 'reply'
        : null;
  return kind
    ? { root: dialog, dialog, editor: editors[0], submit: submits[0], kind }
    : null;
}
export function findXPublicationReplyTarget(
  target: EventTarget | null,
): XPublicationReplyTarget | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(
    '[data-testid="reply"][role="button"]',
  );
  const article = control?.closest(
    'article[data-testid="tweet"][role="article"]',
  );
  if (
    !control ||
    !article ||
    article.parentElement?.closest('article') ||
    !visible(control) ||
    control.hasAttribute('disabled') ||
    control.getAttribute('aria-disabled') === 'true' ||
    !primary(control, article) ||
    [
      ...control.ownerDocument.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ].some(visible)
  )
    return null;
  const identity = extractXPublicationIdentity(article);
  return identity
    ? {
        control,
        article,
        parent: { externalId: identity.externalId, url: identity.url },
      }
    : null;
}
export function readXPublicationAuthorHandle(
  document: Document,
): string | null {
  const accounts = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="SideNav_AccountSwitcher_Button"]',
    ),
  ].filter((element) => element.isConnected);
  if (accounts.length !== 1) return null;
  const handles =
    (accounts[0].textContent ?? '').match(/@[a-z0-9_]{1,15}(?![a-z0-9_])/gi) ??
    [];
  return handles.length === 1 ? handles[0].slice(1).toLowerCase() : null;
}
export function matchingXPublicationCandidates(
  document: Document,
  attempt: PublicationCaptureAttempt,
  now = Date.now(),
): XPublicationCandidate[] {
  return [
    ...new Map(
      [
        ...document.querySelectorAll(
          'article[data-testid="tweet"][role="article"]',
        ),
      ].flatMap((article) => {
        const candidate = extractXPublicationCandidate(article);
        if (!candidate) return [];
        const time = Date.parse(candidate.publicationDate);
        return new URL(candidate.url).origin ===
          publicationCapturePageUrl(attempt.documentUrl)?.origin &&
          candidate.authorHandle === attempt.authorHandle &&
          candidate.description === attempt.description &&
          !attempt.baselineIds.includes(candidate.externalId) &&
          time >= Math.floor(attempt.startedAt / 1000) * 1000 &&
          time <= attempt.startedAt + 60000 &&
          time <= now + 5000
          ? [[candidate.externalId, candidate] as const]
          : [];
      }),
    ).values(),
  ];
}
