import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PublicationCaptureAttempt } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  attachXPublicationObserver,
  extractXPublicationCandidate,
  findXPublicationComposer,
  isTrustedXSubmission,
  isXHome,
  matchingXPublicationCandidates,
} from '~platforms/x-publication-observer';

const home = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/publication-capture/x-home.html'),
  'utf8',
);
const post = readFileSync(
  resolve(
    process.cwd(),
    'tests/fixtures/publication-capture/x-own-post-with-quote.html',
  ),
  'utf8',
);
const startedAt = Date.parse('2026-10-02T18:00:00.000Z');
const attempt: PublicationCaptureAttempt = {
  id: '11111111-1111-4111-8111-111111111111',
  scope: {
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    revision: 1,
  },
  startedAt,
  documentUrl: 'https://x.com/home',
  surface: { kind: 'x-home' },
  authorHandle: 'author',
  description: 'Own authored text',
  baselineIds: [],
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
let stop: (() => void) | undefined;
beforeEach(() => {
  document.body.innerHTML = home + post;
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
it('extracts only primary own header/body/permalink and ignores a nested quoted author and older timestamp', () => {
  expect(extractXPublicationCandidate(required('article'))).toEqual({
    externalId: '456',
    url: 'https://x.com/author/status/456',
    authorHandle: 'author',
    description: 'Own authored text',
    publicationDate: '2026-10-02T18:00:00.000Z',
  });
});
it('rejects quoted-only body, multiple primary bodies and ambiguous own status anchors', () => {
  const article = required('article');
  article.querySelector('[data-testid="tweetText"]')?.remove();
  expect(extractXPublicationCandidate(article)).toBeNull();
  document.body.innerHTML = post;
  const own = required('article');
  const extra = document.createElement('div');
  extra.dataset.testid = 'tweetText';
  extra.textContent = 'second own';
  own.append(extra);
  expect(extractXPublicationCandidate(own)).toBeNull();
  document.body.innerHTML = post;
  const header = required('[data-testid="User-Name"]');
  header.append(
    required('[data-testid="User-Name"] a:has(time)').cloneNode(true),
  );
  expect(extractXPublicationCandidate(required('article'))).toBeNull();
});
it('rejects wrong author, baselineIDs, old same-text and changed/truncated text', () => {
  expect(
    matchingXPublicationCandidates(
      document,
      { ...attempt, authorHandle: 'other' },
      startedAt,
    ),
  ).toEqual([]);
  expect(
    matchingXPublicationCandidates(
      document,
      { ...attempt, baselineIds: ['456'] },
      startedAt,
    ),
  ).toEqual([]);
  expect(
    matchingXPublicationCandidates(
      document,
      { ...attempt, startedAt: startedAt + 10000 },
      startedAt + 10000,
    ),
  ).toEqual([]);
  expect(
    matchingXPublicationCandidates(
      document,
      { ...attempt, description: 'Own authored' },
      startedAt,
    ),
  ).toEqual([]);
});
it('two new ownIDs remain explicitly ambiguous rather than inventing success', () => {
  const second = required('article').cloneNode(true) as Element;
  const anchor = second.querySelector('a:has(time)');
  if (!anchor) throw new Error('Missing fixture anchor');
  anchor.setAttribute('href', 'https://x.com/author/status/457');
  document.body.append(second);
  expect(
    matchingXPublicationCandidates(document, attempt, startedAt),
  ).toHaveLength(2);
});
it('accepts only the unique home composer and trusted nested button click while enabled', () => {
  const composer = findXPublicationComposer(document);
  if (!composer) throw new Error('Missing fixture composer');
  expect(composer).not.toBeNull();
  expect(isTrustedXSubmission(false, composer.submit, composer)).toBe(false);
  expect(
    isTrustedXSubmission(true, composer.submit.querySelector('span'), composer),
  ).toBe(true);
  composer.submit.setAttribute('aria-disabled', 'true');
  expect(isTrustedXSubmission(true, composer.submit, composer)).toBe(false);
  composer.submit.removeAttribute('aria-disabled');
  composer.submit.setAttribute('disabled', '');
  expect(isTrustedXSubmission(true, composer.submit, composer)).toBe(false);
  document.body.insertAdjacentHTML('beforeend', home);
  expect(findXPublicationComposer(document)).toBeNull();
});
it('excludes dialogs and articles, and limits host/path to the inspected adapter', () => {
  const section = required('section');
  section.setAttribute('role', 'dialog');
  expect(findXPublicationComposer(document)).toBeNull();
  expect(isXHome('https://x.com/home')).toBe(true);
  expect(isXHome('https://x.com/author')).toBe(false);
  expect(isXHome('https://not-x.com/home')).toBe(false);
});
it('synthetic native click cannot arm, preventDefault, change text or publish', async () => {
  vi.stubGlobal('location', { href: 'https://x.com/home' });
  send.mockResolvedValue({
    success: true,
    data: {
      kind: 'context',
      enabled: true,
      scope: attempt.scope,
      pending: null,
    },
  });
  stop = attachXPublicationObserver();
  await Promise.resolve();
  const button = required('[data-testid="tweetButtonInline"]');
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  button.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(
    send.mock.calls.some(
      ([request]) => eventOf(request) === 'publicationCaptureBegin',
    ),
  ).toBe(false);
  expect(
    document.querySelector('[data-testid="tweetTextarea_0"]')?.textContent,
  ).toBe('Own authored text');
});

const unsaved =
  'Could not save this recording. Keep this tab open and select Retry recording. Closing the browser may lose it.';
const context = () => ({
  success: true,
  data: {
    kind: 'context',
    enabled: true,
    scope: attempt.scope,
    pending: null,
    confirmed: null,
  },
});
async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}
async function trustedFixtureSubmission() {
  vi.useFakeTimers();
  vi.setSystemTime(startedAt);
  vi.stubGlobal('location', { href: 'https://x.com/home' });
  document.body.innerHTML = home;
  const listeners = vi.spyOn(document, 'addEventListener');
  stop = attachXPublicationObserver();
  await flush();
  const callback = listeners.mock.calls.find(
    ([event]) => event === 'click',
  )?.[1];
  if (typeof callback !== 'function')
    throw new Error('Missing installed click callback');
  // This structural input exercises the production classification boundary; it does not claim a browser-trusted event.
  const input = {
    isTrusted: true,
    target: required('[data-testid="tweetButtonInline"] span'),
  } as unknown as MouseEvent;
  callback(input);
  await flush();
}
it('rescans the fast candidate only after Begin resolves and sends the exact own body/permalink', async () => {
  let release: ((value: unknown) => void) | undefined;
  send.mockImplementation(async (request: unknown) => {
    const event = eventOf(request);
    if (event === 'publicationCaptureContext') return context();
    if (event === 'publicationCaptureBegin')
      return new Promise((resolve) => {
        release = resolve;
      });
    return { success: true, data: { kind: 'queued', attemptId: attempt.id } };
  });
  await trustedFixtureSubmission();
  document.body.insertAdjacentHTML('beforeend', post);
  await vi.advanceTimersByTimeAsync(200);
  expect(
    send.mock.calls.filter(
      ([request]) => eventOf(request) === 'publicationCaptureComplete',
    ),
  ).toHaveLength(0);
  if (!release) throw new Error('Begin was not sent');
  release({ success: true, data: { kind: 'armed', attemptId: attempt.id } });
  await flush();
  await vi.advanceTimersByTimeAsync(300);
  const complete = send.mock.calls.find(
    ([request]) => eventOf(request) === 'publicationCaptureComplete',
  )?.[0];
  expect(complete).toMatchObject({
    observation: {
      externalId: '456',
      url: 'https://x.com/author/status/456',
      description: 'Own authored text',
      publicationDate: '2026-10-02T18:00:00.000Z',
    },
  });
});
it('confirmation stops expiry/history scans and only explicit Retry resends the frozen observation', async () => {
  send.mockImplementation(async (request: unknown) => {
    const event = eventOf(request);
    if (event === 'publicationCaptureContext') return context();
    if (event === 'publicationCaptureComplete')
      return { success: false, error: unsaved };
    return { success: true, data: { kind: 'armed', attemptId: attempt.id } };
  });
  await trustedFixtureSubmission();
  document.body.insertAdjacentHTML('beforeend', post);
  await vi.advanceTimersByTimeAsync(400);
  const completeCalls = () =>
    send.mock.calls.filter(
      ([request]) => eventOf(request) === 'publicationCaptureComplete',
    );
  expect(completeCalls()).toHaveLength(1);
  const exact = completeCalls()[0][0];
  window.dispatchEvent(new Event('focus'));
  await flush();
  await vi.advanceTimersByTimeAsync(120000);
  expect(completeCalls()).toHaveLength(1);
  expect(document.body.textContent).toContain(unsaved);
  required('article [data-testid="tweetText"]').textContent =
    'Changed historical text';
  required('#genfeed-publication-recording-status button').click();
  await flush();
  expect(completeCalls()).toHaveLength(2);
  expect(completeCalls()[1][0]).toEqual(exact);
  let release: ((value: unknown) => void) | undefined;
  send.mockImplementation(async (request: unknown) => {
    if (eventOf(request) === 'publicationCaptureComplete')
      return new Promise((resolve) => {
        release = resolve;
      });
    return context();
  });
  const priorButton = required('#genfeed-publication-recording-status button');
  priorButton.click();
  await flush();
  expect(
    required('#genfeed-publication-recording-status button'),
  ).toHaveProperty('disabled', true);
  stop?.();
  priorButton.click();
  if (!release) throw new Error('Explicit retry not sent');
  release({ success: true, data: { kind: 'queued', attemptId: attempt.id } });
  await flush();
  expect(completeCalls()).toHaveLength(3);
  expect(
    document.querySelector('#genfeed-publication-recording-status'),
  ).toBeNull();
});
it('missing account and expired or disconnected attempts cannot complete', async () => {
  send.mockImplementation(async (request: unknown) => {
    if (eventOf(request) === 'publicationCaptureContext') return context();
    return { success: true, data: { kind: 'armed', attemptId: attempt.id } };
  });
  await trustedFixtureSubmission();
  await vi.advanceTimersByTimeAsync(60001);
  document.body.insertAdjacentHTML('beforeend', post);
  await vi.advanceTimersByTimeAsync(500);
  expect(
    send.mock.calls.some(
      ([request]) => eventOf(request) === 'publicationCaptureComplete',
    ),
  ).toBe(false);
  stop?.();
  document.body.innerHTML = home;
  const listeners = vi.spyOn(document, 'addEventListener');
  stop = attachXPublicationObserver();
  await flush();
  required('[data-testid="SideNav_AccountSwitcher_Button"]').remove();
  const callback = listeners.mock.calls
    .filter(([event]) => event === 'click')
    .at(-1)?.[1];
  if (typeof callback !== 'function') throw new Error('Missing callback');
  const prior = send.mock.calls.filter(
    ([request]) => eventOf(request) === 'publicationCaptureBegin',
  ).length;
  callback({
    isTrusted: true,
    target: required('[data-testid="tweetButtonInline"]'),
  } as unknown as MouseEvent);
  await flush();
  expect(
    send.mock.calls.filter(
      ([request]) => eventOf(request) === 'publicationCaptureBegin',
    ),
  ).toHaveLength(prior);
});
it('changed scope hides recovery and removes stale retry listeners', async () => {
  let foreign = false;
  send.mockImplementation(async (request: unknown) => {
    if (eventOf(request) === 'publicationCaptureContext')
      return foreign
        ? {
            success: true,
            data: {
              ...context().data,
              scope: { ...attempt.scope, brandId: 'foreign' },
            },
          }
        : context();
    if (eventOf(request) === 'publicationCaptureComplete')
      return { success: false, error: unsaved };
    return { success: true, data: { kind: 'armed', attemptId: attempt.id } };
  });
  await trustedFixtureSubmission();
  document.body.insertAdjacentHTML('beforeend', post);
  await vi.advanceTimersByTimeAsync(400);
  const prior = required('#genfeed-publication-recording-status button');
  foreign = true;
  const changed = vi
    .mocked(chrome.storage.onChanged.addListener)
    .mock.calls.at(-1)?.[0];
  if (!changed) throw new Error('Missing storage listener');
  changed({ extension_workspace_changed: { newValue: 'foreign' } }, 'local');
  expect(
    document.querySelector('#genfeed-publication-recording-status'),
  ).toBeNull();
  await flush();
  prior.click();
  expect(
    document.querySelector('#genfeed-publication-recording-status'),
  ).toBeNull();
  expect(
    send.mock.calls.filter(
      ([request]) => eventOf(request) === 'publicationCaptureComplete',
    ),
  ).toHaveLength(1);
});

it('unrelated settings writes keep a pending attempt; toggling recording cancels it', async () => {
  send.mockImplementation(async (request) =>
    eventOf(request) === 'publicationCaptureContext'
      ? context()
      : { success: true, data: { kind: 'armed', attemptId: attempt.id } },
  );
  await trustedFixtureSubmission();
  const changed = vi
    .mocked(chrome.storage.onChanged.addListener)
    .mock.calls.at(-1)?.[0];
  if (!changed) throw new Error('Missing storage listener');
  const cancels = () =>
    send.mock.calls.filter(
      ([request]) => eventOf(request) === 'publicationCaptureCancel',
    ).length;
  changed(
    {
      'genfeed-settings': {
        oldValue: { recordOwnPublications: true, theme: 'light' },
        newValue: { recordOwnPublications: true, theme: 'dark' },
      },
    },
    'local',
  );
  await flush();
  expect(cancels()).toBe(0);
  changed(
    {
      'genfeed-settings': {
        oldValue: { recordOwnPublications: true },
        newValue: { recordOwnPublications: false },
      },
    },
    'local',
  );
  await flush();
  expect(cancels()).toBeGreaterThan(0);
});

it('unsupported same-X route cancels the active home attempt while keeping the dormant listener alive', async () => {
  send.mockImplementation(async (request) =>
    eventOf(request) === 'publicationCaptureContext'
      ? context()
      : { success: true, data: { kind: 'armed', attemptId: attempt.id } },
  );
  await trustedFixtureSubmission();
  vi.stubGlobal('location', { href: 'https://x.com/notifications' });
  window.dispatchEvent(new PopStateEvent('popstate'));
  await flush();
  expect(
    send.mock.calls.some(
      ([request]) => eventOf(request) === 'publicationCaptureCancel',
    ),
  ).toBe(true);
  document.body.insertAdjacentHTML('beforeend', post);
  await vi.advanceTimersByTimeAsync(500);
  expect(
    send.mock.calls.some(
      ([request]) => eventOf(request) === 'publicationCaptureComplete',
    ),
  ).toBe(false);
});
