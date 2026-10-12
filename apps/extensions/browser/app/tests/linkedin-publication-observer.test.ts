import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PublicationCaptureAttempt } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  findLinkedInComposer,
  isTrustedLinkedInSubmission,
  linkedInBaselineIds,
  matchingLinkedInPublicationCandidates,
} from '~platforms/linkedin-publication-dom';
import { attachLinkedInPublicationObserver } from '~platforms/linkedin-publication-observer';

const ORIGIN = 'https://www.linkedin.com';
const FEED = `${ORIGIN}/feed/`;
const startedAt = Date.parse('2026-10-12T10:00:00.000Z');
// LinkedIn ids are snowflakes: the leading bits are the creation time.
const idAt = (ms: number) => (BigInt(ms) << BigInt(22)).toString();
const ids = {
  OLD_POST: idAt(startedAt - 3 * 86_400_000),
  NEW_POST: idAt(startedAt + 2000),
  POST: idAt(startedAt - 3_600_000),
  OLD_COMMENT: idAt(startedAt - 1_800_000),
  NEW_COMMENT: idAt(startedAt + 3000),
};
const fixture = (name: string, extra: Record<string, string> = {}) =>
  Object.entries({ ...ids, ...extra }).reduce(
    (html, [token, value]) => html.replaceAll(`{{${token}}}`, value),
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/publication-capture/${name}`),
      'utf8',
    ),
  );
const postUrn = `urn:li:activity:${ids.NEW_POST}`;
const postPermalink = `${ORIGIN}/feed/update/${postUrn}/`;
const parentUrn = `urn:li:activity:${ids.POST}`;
const newCommentUrn = `urn:li:comment:(activity:${ids.POST},${ids.NEW_COMMENT})`;
const oldCommentUrn = `urn:li:comment:(activity:${ids.POST},${ids.OLD_COMMENT})`;
const scope = {
  userId: 'user',
  organizationId: 'org',
  brandId: 'brand',
  revision: 1,
};
const postAttempt: PublicationCaptureAttempt = {
  id: '11111111-1111-4111-8111-111111111111',
  scope,
  startedAt,
  documentUrl: FEED,
  surface: { kind: 'linkedin-post' },
  authorHandle: null,
  description: 'Own authored text',
  baselineIds: [`urn:li:activity:${ids.OLD_POST}`],
};
const commentAttempt: PublicationCaptureAttempt = {
  ...postAttempt,
  surface: {
    kind: 'linkedin-comment',
    parent: {
      externalId: parentUrn,
      url: `${ORIGIN}/feed/update/${parentUrn}/`,
    },
  },
  description: 'Own reply',
  baselineIds: [parentUrn, oldCommentUrn],
};
function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing fixture element ${selector}`);
  return element;
}
const send = vi.fn<(request: unknown) => Promise<unknown>>();
function eventOf(request: unknown) {
  return typeof request === 'object' && request !== null && 'event' in request
    ? request.event
    : null;
}
const calls = (event: string) =>
  send.mock.calls.filter(([request]) => eventOf(request) === event);
let stop: (() => void) | undefined;
beforeEach(() => {
  send.mockReset();
  Object.assign(chrome.runtime, { sendMessage: send });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('finds the share-box Post button and a comment box, and ignores everything else', () => {
  document.body.innerHTML = fixture('linkedin-post-modal.html');
  const post = findLinkedInComposer(
    required('.share-actions__primary-action span'),
    ORIGIN,
  );
  expect(post).toMatchObject({ kind: 'post', parent: null });
  expect(post?.editor.textContent).toBe('Own authored text');
  expect(findLinkedInComposer(required('.ql-editor'), ORIGIN)).toBeNull();
  expect(findLinkedInComposer(null, ORIGIN)).toBeNull();
  required('.share-creation-state').append(
    required('.ql-editor').cloneNode(true),
  );
  expect(
    findLinkedInComposer(required('.share-actions__primary-action'), ORIGIN),
  ).toBeNull();

  document.body.innerHTML = fixture('linkedin-comment-box.html');
  expect(
    findLinkedInComposer(
      required('.comments-comment-box__submit-button span'),
      ORIGIN,
    ),
  ).toMatchObject({
    kind: 'comment',
    parent: {
      externalId: parentUrn,
      url: `${ORIGIN}/feed/update/${parentUrn}/`,
    },
  });
});

it('anchors a reply to a comment on that comment and its post', () => {
  document.body.innerHTML = fixture('linkedin-comment-box.html');
  required('.comments-comment-entity').append(
    required('form.comments-comment-box__form'),
  );
  expect(
    findLinkedInComposer(
      required('.comments-comment-box__submit-button'),
      ORIGIN,
    )?.parent,
  ).toEqual({
    externalId: oldCommentUrn,
    url: `${ORIGIN}/feed/update/${parentUrn}/`,
  });
});

it('accepts only a trusted click on an enabled submit button', () => {
  document.body.innerHTML = fixture('linkedin-post-modal.html');
  const composer = findLinkedInComposer(
    required('.share-actions__primary-action'),
    ORIGIN,
  );
  if (!composer) throw new Error('Missing composer');
  expect(isTrustedLinkedInSubmission(false, composer.submit, composer)).toBe(
    false,
  );
  expect(
    isTrustedLinkedInSubmission(
      true,
      composer.submit.querySelector('span'),
      composer,
    ),
  ).toBe(true);
  composer.submit.setAttribute('aria-disabled', 'true');
  expect(isTrustedLinkedInSubmission(true, composer.submit, composer)).toBe(
    false,
  );
  composer.submit.removeAttribute('aria-disabled');
  composer.submit.setAttribute('disabled', '');
  expect(isTrustedLinkedInSubmission(true, composer.submit, composer)).toBe(
    false,
  );
  expect(isTrustedLinkedInSubmission(true, document.body, composer)).toBe(
    false,
  );
});

it('baselines every post, comment and toast already on the page', () => {
  document.body.innerHTML =
    fixture('linkedin-comment-box.html') +
    fixture('linkedin-post-published.html', {
      TOAST_HREF: postPermalink,
    });
  expect(linkedInBaselineIds(document, ORIGIN).sort()).toEqual(
    [parentUrn, oldCommentUrn, postUrn].sort(),
  );
});

it.each([
  ['an activity permalink', postPermalink, postUrn],
  ['a relative permalink', `/feed/update/${postUrn}`, postUrn],
  [
    'a share permalink',
    `${ORIGIN}/feed/update/urn:li:share:${ids.NEW_POST}/`,
    `urn:li:share:${ids.NEW_POST}`,
  ],
])('confirms a new post from %s in the published toast', (_name, href, urn) => {
  document.body.innerHTML = fixture('linkedin-post-published.html', {
    TOAST_HREF: href,
  });
  const found = matchingLinkedInPublicationCandidates(
    document,
    postAttempt,
    startedAt + 1000,
  );
  expect(found).toHaveLength(1);
  expect(found[0]).toMatchObject({
    externalId: urn,
    url: `${ORIGIN}/feed/update/${urn}/`,
    publicationDate: new Date(startedAt + 2000).toISOString(),
  });
});

it('reads the author from the published update when it is on the page', () => {
  document.body.innerHTML = fixture('linkedin-post-published.html', {
    TOAST_HREF: postPermalink,
  });
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      postAttempt,
      startedAt + 1000,
    )[0].authorHandle,
  ).toBe('own-author');
  required('.update-components-actor').remove();
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      postAttempt,
      startedAt + 1000,
    )[0].authorHandle,
  ).toBeNull();
});

it('rejects a toast that is not this new post', () => {
  const published = (href: string) => {
    document.body.innerHTML = fixture('linkedin-post-published.html', {
      TOAST_HREF: href,
    });
    return matchingLinkedInPublicationCandidates(
      document,
      postAttempt,
      startedAt + 1000,
    );
  };
  expect(published(postPermalink)).toHaveLength(1);
  // Already on the page when the user pressed Post.
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      { ...postAttempt, baselineIds: [postUrn] },
      startedAt + 1000,
    ),
  ).toEqual([]);
  // An old post whose toast or link scrolled into view is not a new publication.
  expect(
    published(`${ORIGIN}/feed/update/urn:li:activity:${ids.OLD_POST}/`),
  ).toEqual([]);
  // A different site, a comment link and an unrelated link are not post permalinks.
  expect(published(`https://example.com/feed/update/${postUrn}/`)).toEqual([]);
  expect(
    published(
      `${postPermalink}?${new URLSearchParams({ commentUrn: newCommentUrn })}`,
    ),
  ).toEqual([]);
  expect(published(`${ORIGIN}/in/own-author/`)).toEqual([]);
  // The update is on the page with different text than was submitted.
  document.body.innerHTML = fixture('linkedin-post-published.html', {
    TOAST_HREF: postPermalink,
  });
  required('.update-components-text').textContent = 'Someone else wrote this';
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      postAttempt,
      startedAt + 1000,
    ),
  ).toEqual([]);
});

it('confirms a new comment under the parent post and nothing else', () => {
  document.body.innerHTML =
    fixture('linkedin-comment-box.html') +
    fixture('linkedin-comment-published.html');
  const found = matchingLinkedInPublicationCandidates(
    document,
    commentAttempt,
    startedAt + 1000,
  );
  expect(found).toEqual([
    {
      externalId: newCommentUrn,
      url: `${ORIGIN}/feed/update/${parentUrn}/?${new URLSearchParams({ commentUrn: newCommentUrn })}`,
      authorHandle: 'own-author',
      publicationDate: new Date(startedAt + 3000).toISOString(),
    },
  ]);
  // The earlier comment never matches, and neither does changed text or another post.
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      { ...commentAttempt, description: 'An earlier comment' },
      startedAt + 1000,
    ),
  ).toEqual([]);
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      { ...commentAttempt, description: 'Own' },
      startedAt + 1000,
    ),
  ).toEqual([]);
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      { ...commentAttempt, baselineIds: [parentUrn, newCommentUrn] },
      startedAt + 1000,
    ),
  ).toEqual([]);
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      {
        ...commentAttempt,
        surface: {
          kind: 'linkedin-comment',
          parent: {
            externalId: `urn:li:activity:${ids.OLD_POST}`,
            url: `${ORIGIN}/feed/update/urn:li:activity:${ids.OLD_POST}/`,
          },
        },
      },
      startedAt + 1000,
    ),
  ).toEqual([]);
});

it('does not take an old comment that merely scrolled into view for a new one', () => {
  document.body.innerHTML =
    fixture('linkedin-comment-box.html') +
    fixture('linkedin-comment-published.html', {
      NEW_COMMENT: idAt(startedAt - 5 * 86_400_000),
    });
  expect(
    matchingLinkedInPublicationCandidates(
      document,
      commentAttempt,
      startedAt + 1000,
    ),
  ).toEqual([]);
});

const context = () => ({
  success: true,
  data: {
    kind: 'context',
    enabled: true,
    scope,
    pending: null,
    confirmed: null,
  },
});
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
const armed = { success: true, data: { kind: 'armed', attemptId: 'a' } };
async function submit(page: string, selector: string, begin: unknown = armed) {
  vi.useFakeTimers();
  vi.setSystemTime(startedAt);
  vi.stubGlobal('location', { href: FEED });
  document.body.innerHTML = page;
  send.mockImplementation(async (request: unknown) =>
    eventOf(request) === 'publicationCaptureContext'
      ? context()
      : eventOf(request) === 'publicationCaptureBegin'
        ? begin
        : { success: true, data: { kind: 'queued', attemptId: 'a' } },
  );
  const listeners = vi.spyOn(document, 'addEventListener');
  stop = attachLinkedInPublicationObserver();
  await flush();
  const callback = listeners.mock.calls.find(
    ([event]) => event === 'click',
  )?.[1];
  if (typeof callback !== 'function')
    throw new Error('Missing installed click callback');
  // This structural input exercises the production classification boundary; it does not claim a browser-trusted event.
  callback({
    isTrusted: true,
    target: required(selector),
  } as unknown as MouseEvent);
  await flush();
}
function beginOf(): PublicationCaptureAttempt {
  const request = calls('publicationCaptureBegin')[0]?.[0] as
    | { attempt: PublicationCaptureAttempt }
    | undefined;
  if (!request) throw new Error('Begin was not sent');
  return request.attempt;
}

it('treats an empty runtime reply as no capture context', async () => {
  vi.stubGlobal('location', { href: FEED });
  document.body.innerHTML = fixture('linkedin-post-modal.html');
  // chrome.runtime.sendMessage resolves undefined when no listener replies.
  send.mockResolvedValue(undefined);
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    stop = attachLinkedInPublicationObserver();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off('unhandledRejection', onRejection);
  }

  expect(calls('publicationCaptureContext')).toHaveLength(1);
  expect(rejections).toEqual([]);
});

it('a synthetic click cannot arm anything', async () => {
  vi.stubGlobal('location', { href: FEED });
  document.body.innerHTML = fixture('linkedin-post-modal.html');
  send.mockResolvedValue(context());
  stop = attachLinkedInPublicationObserver();
  await Promise.resolve();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  required('.share-actions__primary-action').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(calls('publicationCaptureBegin')).toHaveLength(0);
});

it('arms a post with the exact text, then records the permalink the toast confirms', async () => {
  await submit(
    fixture('linkedin-post-modal.html'),
    '.share-actions__primary-action span',
  );
  expect(beginOf()).toMatchObject({
    authorHandle: null,
    description: 'Own authored text',
    documentUrl: FEED,
    surface: { kind: 'linkedin-post' },
    baselineIds: [`urn:li:activity:${ids.OLD_POST}`],
  });
  // The submit click alone is not success.
  await vi.advanceTimersByTimeAsync(500);
  expect(calls('publicationCaptureComplete')).toHaveLength(0);
  document.body.insertAdjacentHTML(
    'beforeend',
    fixture('linkedin-post-published.html', { TOAST_HREF: postPermalink }),
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(calls('publicationCaptureComplete')).toHaveLength(1);
  expect(calls('publicationCaptureComplete')[0][0]).toEqual({
    event: 'publicationCaptureComplete',
    observation: {
      attemptId: beginOf().id,
      externalId: postUrn,
      url: postPermalink,
      authorHandle: 'own-author',
      description: 'Own authored text',
      publicationDate: new Date(startedAt + 2000).toISOString(),
    },
  });
  // The observer stops watching once the publication is confirmed: no second recording.
  document.body.insertAdjacentHTML(
    'beforeend',
    fixture('linkedin-post-published.html', { TOAST_HREF: postPermalink }),
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls('publicationCaptureComplete')).toHaveLength(1);
});

it('arms a reply under its post, then records the new comment', async () => {
  await submit(
    fixture('linkedin-comment-box.html'),
    '.comments-comment-box__submit-button span',
  );
  expect(beginOf()).toMatchObject({
    description: 'Own reply',
    surface: {
      kind: 'linkedin-comment',
      parent: { externalId: parentUrn },
    },
    baselineIds: expect.arrayContaining([parentUrn, oldCommentUrn]),
  });
  document
    .querySelector('.comments-comments-list')
    ?.insertAdjacentHTML(
      'beforeend',
      fixture('linkedin-comment-published.html'),
    );
  await vi.advanceTimersByTimeAsync(500);
  expect(calls('publicationCaptureComplete')[0][0]).toMatchObject({
    observation: {
      externalId: newCommentUrn,
      url: `${ORIGIN}/feed/update/${parentUrn}/?${new URLSearchParams({ commentUrn: newCommentUrn })}`,
      authorHandle: 'own-author',
      description: 'Own reply',
    },
  });
});

it('text the extension did not write is dropped without a notice or any recording', async () => {
  await submit(
    fixture('linkedin-post-modal.html'),
    '.share-actions__primary-action span',
    { success: false, error: 'Not written with Genfeed' },
  );
  document.body.insertAdjacentHTML(
    'beforeend',
    fixture('linkedin-post-published.html', { TOAST_HREF: postPermalink }),
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(calls('publicationCaptureComplete')).toHaveLength(0);
  expect(
    document.querySelector('#genfeed-publication-recording-status'),
  ).toBeNull();
});

it('an attempt that is never confirmed expires without recording', async () => {
  await submit(
    fixture('linkedin-post-modal.html'),
    '.share-actions__primary-action span',
  );
  await vi.advanceTimersByTimeAsync(60001);
  document.body.insertAdjacentHTML(
    'beforeend',
    fixture('linkedin-post-published.html', { TOAST_HREF: postPermalink }),
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(calls('publicationCaptureComplete')).toHaveLength(0);
  expect(calls('publicationCaptureCancel')).toHaveLength(1);
});

it('navigating away from the page abandons the attempt', async () => {
  await submit(
    fixture('linkedin-post-modal.html'),
    '.share-actions__primary-action span',
  );
  vi.stubGlobal('location', { href: `${ORIGIN}/messaging/` });
  window.dispatchEvent(new PopStateEvent('popstate'));
  await flush();
  expect(calls('publicationCaptureCancel')).toHaveLength(1);
  document.body.insertAdjacentHTML(
    'beforeend',
    fixture('linkedin-post-published.html', { TOAST_HREF: postPermalink }),
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(calls('publicationCaptureComplete')).toHaveLength(0);
});

it('two matching toasts are ambiguous and are never guessed', async () => {
  await submit(
    fixture('linkedin-post-modal.html'),
    '.share-actions__primary-action span',
  );
  document.body.insertAdjacentHTML(
    'beforeend',
    fixture('linkedin-post-published.html', { TOAST_HREF: postPermalink }) +
      fixture('linkedin-post-published.html', {
        TOAST_HREF: `${ORIGIN}/feed/update/urn:li:activity:${idAt(startedAt + 4000)}/`,
        NEW_POST: idAt(startedAt + 4000),
      }),
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(calls('publicationCaptureComplete')).toHaveLength(0);
});
