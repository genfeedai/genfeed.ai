import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import {
  extractXPublicationIdentity,
  findXPublicationModalComposer,
  findXPublicationReplyTarget,
} from '~platforms/x-publication-dom';
import { attachXPublicationObserver } from '~platforms/x-publication-observer';
import {
  parsePublicationCaptureAttempt,
  publicationCaptureRecord,
} from '~services/publication-capture-validation';

const fixture = (name: string) =>
  readFileSync(
    resolve(process.cwd(), `tests/fixtures/publication-capture/${name}.html`),
    'utf8',
  );
const source = fixture('x-reply-source'),
  replyModal = fixture('x-reply-modal'),
  postModal = fixture('x-post-modal'),
  ownReply = fixture('x-own-reply');
const scope = {
  userId: 'user',
  organizationId: 'org',
  brandId: 'brand',
  revision: 1,
};
const now = Date.parse('2026-10-03T00:00:00Z');
const send = vi.fn<(request: unknown) => Promise<unknown>>();
let stop: (() => void) | undefined;
let listeners: MockInstance<typeof document.addEventListener>;
const requestData = (request: unknown) => publicationCaptureRecord(request);
const events = (event: string) =>
  send.mock.calls.filter(([r]) => requestData(r)?.event === event);
const required = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
};
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function trusted(target: HTMLElement) {
  const handler = listeners.mock.calls.find(
    ([event]) => event === 'click',
  )?.[1];
  if (typeof handler !== 'function')
    throw new Error('Missing actual click handler');
  Reflect.apply(handler, document, [{ isTrusted: true, target }]);
}
async function attach(url = 'https://x.com/other/status/123') {
  vi.stubGlobal('location', new URL(url));
  listeners = vi.spyOn(document, 'addEventListener');
  stop = attachXPublicationObserver();
  await flush();
}
async function openReply() {
  trusted(required('article > [data-testid="reply"]'));
  await flush();
  vi.stubGlobal('location', new URL('https://x.com/compose/post'));
  document.body.insertAdjacentHTML('beforeend', replyModal);
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  await flush();
}
async function submit() {
  trusted(required('[data-testid="tweetButton"]'));
  await flush();
}
async function success() {
  required('[role="dialog"]').remove();
  vi.stubGlobal('location', new URL('https://x.com/other/status/123'));
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  document.body.insertAdjacentHTML('beforeend', ownReply);
  await flush();
  await vi.advanceTimersByTimeAsync(400);
  await flush();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  document.body.innerHTML = source;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([new DOMRect(0, 0, 100, 20)], {
      item: (index: number) =>
        index === 0 ? new DOMRect(0, 0, 100, 20) : null,
    }),
  );
  Object.assign(chrome.runtime, { sendMessage: send });
  send.mockReset().mockImplementation(async (request) => {
    const r = requestData(request);
    if (r?.event === 'publicationCaptureContext')
      return {
        success: true,
        data: {
          kind: 'context',
          enabled: true,
          scope,
          pending: null,
          confirmed: null,
        },
      };
    if (r?.event === 'publicationCaptureReplyIntent')
      return {
        success: true,
        data: {
          kind: 'reply-intent',
          intentId: '22222222-2222-4222-8222-222222222222',
        },
      };
    if (r?.event === 'publicationCaptureBegin')
      return {
        success: true,
        data: {
          kind: 'armed',
          attemptId: parsePublicationCaptureAttempt(r.attempt)?.id,
        },
      };
    return { success: true, data: { kind: 'queued' } };
  });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = '';
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('binds trusted original source through a new Reply modal to a distinct own primary status', async () => {
  await attach();
  await openReply();
  expect(events('publicationCaptureReplyIntent')).toHaveLength(1);
  expect(findXPublicationModalComposer(document)?.kind).toBe('reply');
  expect(
    extractXPublicationIdentity(required('[aria-modal="true"] article')),
  ).toBeNull();
  await submit();
  const attempt = parsePublicationCaptureAttempt(
    requestData(events('publicationCaptureBegin')[0]?.[0])?.attempt,
  );
  expect(attempt).toMatchObject({
    surface: {
      kind: 'x-reply-modal',
      parent: { externalId: '123', url: 'https://x.com/other/status/123' },
    },
    baselineIds: ['123'],
    description: 'Own authored reply',
    documentUrl: 'https://x.com/compose/post',
  });
  await success();
  expect(events('publicationCaptureComplete')).toHaveLength(1);
  expect(
    requestData(events('publicationCaptureComplete')[0][0])?.observation,
  ).toMatchObject({
    externalId: '456',
    authorHandle: 'author',
    description: 'Own authored reply',
    url: 'https://x.com/author/status/456',
  });
});
it('retains the original reply binding after 45 seconds of composition and refresh', async () => {
  await attach();
  await openReply();
  await vi.advanceTimersByTimeAsync(45000);
  required('[data-testid="tweetTextarea_0"]').append(
    document.createTextNode(''),
  );
  await flush();
  window.dispatchEvent(new Event('focus'));
  await flush();
  const submittedAt = Date.now();
  await submit();
  expect(events('publicationCaptureReplyIntent')).toHaveLength(1);
  expect(events('publicationCaptureBegin')).toHaveLength(1);
  expect(
    requestData(events('publicationCaptureBegin')[0][0])?.attempt,
  ).toMatchObject({ startedAt: submittedAt });
  required('[role="dialog"]').remove();
  vi.stubGlobal('location', new URL('https://x.com/other/status/123'));
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  document.body.insertAdjacentHTML(
    'beforeend',
    ownReply.replace(
      '2026-10-03T00:00:00Z',
      new Date(submittedAt).toISOString(),
    ),
  );
  await flush();
  await vi.advanceTimersByTimeAsync(400);
  expect(events('publicationCaptureComplete')).toHaveLength(1);
  expect(
    requestData(events('publicationCaptureComplete')[0][0])?.observation,
  ).toMatchObject({ publicationDate: new Date(submittedAt).toISOString() });
});
it('records a standalone zero-article Post modal with exact return route and no reply intent', async () => {
  document.body.innerHTML =
    '<button data-testid="SideNav_AccountSwitcher_Button">@author</button>';
  await attach('https://x.com/home');
  vi.stubGlobal('location', new URL('https://x.com/compose/post'));
  document.body.insertAdjacentHTML('beforeend', postModal);
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  await submit();
  expect(events('publicationCaptureReplyIntent')).toHaveLength(0);
  expect(
    requestData(events('publicationCaptureBegin')[0][0])?.attempt,
  ).toMatchObject({
    surface: { kind: 'x-post-modal', returnUrl: 'https://x.com/home' },
    description: 'Own authored text',
  });
});
it('direct Post modal permits null return while direct Reply modal cannot infer parent', async () => {
  document.body.innerHTML =
    '<button data-testid="SideNav_AccountSwitcher_Button">@author</button>' +
    postModal;
  await attach('https://x.com/compose/post');
  await submit();
  expect(
    requestData(events('publicationCaptureBegin')[0][0])?.attempt,
  ).toMatchObject({ surface: { kind: 'x-post-modal', returnUrl: null } });
  stop?.();
  send.mockClear();
  document.body.innerHTML = source + replyModal;
  await attach('https://x.com/compose/post');
  await submit();
  expect(events('publicationCaptureBegin')).toHaveLength(0);
});
it('synthetic dispatch never registers intent, edits text or submits native controls', async () => {
  await attach();
  const reply = required('article > [data-testid="reply"]');
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  reply.dispatchEvent(click);
  await flush();
  expect(click.defaultPrevented).toBe(false);
  expect(events('publicationCaptureReplyIntent')).toHaveLength(0);
  expect(reply.textContent).toBe('Reply');
});
it('rejects nested quote Reply and ambiguous primary headers while media-only original parents remain valid', () => {
  expect(
    findXPublicationReplyTarget(
      required('[role="link"] [data-testid="reply"]'),
    ),
  ).toBeNull();
  required('article > [data-testid="tweetText"]').remove();
  expect(
    findXPublicationReplyTarget(required('article > [data-testid="reply"]'))
      ?.parent.externalId,
  ).toBe('123');
  required('article').append(
    required('article > [data-testid="User-Name"]').cloneNode(true),
  );
  expect(
    findXPublicationReplyTarget(required('article > [data-testid="reply"]')),
  ).toBeNull();
});
it.each([
  'dialogs',
  'editors',
  'buttons',
  'articles',
  'hidden',
  'disabled-label',
  'quote-label',
])('rejects ambiguous or unsupported modal %s', (kind) => {
  document.body.insertAdjacentHTML('beforeend', replyModal);
  const dialog = required('[aria-modal="true"]');
  if (kind === 'dialogs') document.body.append(dialog.cloneNode(true));
  if (kind === 'editors')
    dialog.append(required('[data-testid="tweetTextarea_0"]').cloneNode(true));
  if (kind === 'buttons')
    dialog.append(required('[data-testid="tweetButton"]').cloneNode(true));
  if (kind === 'articles')
    dialog.append(required('[aria-modal="true"] article').cloneNode(true));
  if (kind === 'hidden') dialog.hidden = true;
  if (kind === 'disabled-label')
    required('[data-testid="tweetButton"]').textContent = 'Responder';
  if (kind === 'quote-label')
    required('[data-testid="tweetButton"]').textContent = 'Post';
  expect(findXPublicationModalComposer(document)).toBeNull();
});
it('late token response after premature submit is cancelled and cannot arm', async () => {
  let release: ((response: unknown) => void) | undefined;
  send.mockImplementation(async (request) => {
    if (requestData(request)?.event === 'publicationCaptureContext')
      return {
        success: true,
        data: {
          kind: 'context',
          enabled: true,
          scope,
          pending: null,
          confirmed: null,
        },
      };
    if (requestData(request)?.event === 'publicationCaptureReplyIntent')
      return new Promise((resolve) => {
        release = resolve;
      });
    return { success: true, data: { kind: 'queued' } };
  });
  await attach();
  trusted(required('article > [data-testid="reply"]'));
  await flush();
  vi.stubGlobal('location', new URL('https://x.com/compose/post'));
  document.body.insertAdjacentHTML('beforeend', replyModal);
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  await submit();
  release?.({
    success: true,
    data: {
      kind: 'reply-intent',
      intentId: '22222222-2222-4222-8222-222222222222',
    },
  });
  await flush();
  expect(events('publicationCaptureBegin')).toHaveLength(0);
  expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
});
it.each(['actor', 'editor', 'close', 'expiry'])(
  'invalidates unsent reply binding on %s',
  async (kind) => {
    await attach();
    await openReply();
    if (kind === 'actor')
      required('[data-testid="SideNav_AccountSwitcher_Button"]').textContent =
        '@changed';
    if (kind === 'editor')
      required('[data-testid="tweetTextarea_0"]').replaceWith(
        required('[data-testid="tweetTextarea_0"]').cloneNode(true),
      );
    if (kind === 'close') trusted(required('[data-testid="app-bar-close"]'));
    if (kind === 'expiry') await vi.advanceTimersByTimeAsync(600001);
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(0);
  },
);
it.each(['unrelated', 'close', 'actor', 'parent', 'ambiguous', 'changed-text'])(
  'never confirms a submitted reply after %s',
  async (kind) => {
    await attach();
    await openReply();
    await submit();
    if (kind === 'unrelated') {
      vi.stubGlobal('location', new URL('https://x.com/notifications'));
      window.dispatchEvent(new Event('genfeed-publication-navigation'));
    }
    if (kind === 'close') trusted(required('[data-testid="app-bar-close"]'));
    if (kind === 'actor')
      required('[data-testid="SideNav_AccountSwitcher_Button"]').textContent =
        '@changed';
    let html = ownReply;
    if (kind === 'parent')
      html = html.replace('/author/status/456', '/author/status/123');
    if (kind === 'changed-text')
      html = html.replace('Own authored reply', 'changed');
    if (kind === 'ambiguous') html += ownReply.replaceAll('456', '457');
    document.body.insertAdjacentHTML('beforeend', html);
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
  },
);
it('disabled recording never arms Reply or standalone Post', async () => {
  send.mockResolvedValue({
    success: true,
    data: {
      kind: 'context',
      enabled: false,
      scope: null,
      pending: null,
      confirmed: null,
    },
  });
  await attach();
  trusted(required('article > [data-testid="reply"]'));
  await flush();
  expect(events('publicationCaptureReplyIntent')).toHaveLength(0);
  document.body.insertAdjacentHTML('beforeend', postModal);
  vi.stubGlobal('location', new URL('https://x.com/compose/post'));
  await submit();
  expect(events('publicationCaptureBegin')).toHaveLength(0);
});

it('does not show a failure overlay for a Reply submit while recording is disabled', async () => {
  send.mockResolvedValue({
    success: true,
    data: {
      kind: 'context',
      enabled: false,
      scope: null,
      pending: null,
      confirmed: null,
    },
  });
  await attach();
  await openReply();
  await submit();
  expect(events('publicationCaptureBegin')).toHaveLength(0);
  expect(
    document.querySelector('#genfeed-publication-recording-status'),
  ).toBeNull();
});
it('resolves source permalinks against document base and rejects malformed links without throwing', () => {
  const base = document.createElement('base');
  base.href = 'https://x.com/';
  document.head.append(base);
  try {
    required('article > [data-testid="User-Name"] a').setAttribute(
      'href',
      '/other',
    );
    required('article > [data-testid="User-Name"] a:has(time)').setAttribute(
      'href',
      '/other/status/123',
    );
    expect(extractXPublicationIdentity(required('article'))?.externalId).toBe(
      '123',
    );
    required('article > [data-testid="User-Name"] a:has(time)').setAttribute(
      'href',
      'https://[',
    );
    expect(() =>
      extractXPublicationIdentity(required('article')),
    ).not.toThrow();
    expect(extractXPublicationIdentity(required('article'))).toBeNull();
  } finally {
    base.remove();
  }
});

it.each([600000, 600001])(
  'keeps the absolute composition boundary at %i ms',
  async (age) => {
    await attach();
    await openReply();
    await vi.advanceTimersByTimeAsync(age);
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(
      age === 600000 ? 1 : 0,
    );
    expect(events('publicationCaptureReplyIntent')).toHaveLength(1);
  },
);
it.each([30000, 30001])(
  'requires first modal association within 30 seconds: %i ms',
  async (age) => {
    await attach();
    trusted(required('article > [data-testid="reply"]'));
    await flush();
    await vi.advanceTimersByTimeAsync(age);
    vi.stubGlobal('location', new URL('https://x.com/compose/post'));
    document.body.insertAdjacentHTML('beforeend', replyModal);
    window.dispatchEvent(new Event('genfeed-publication-navigation'));
    await flush();
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(
      age === 30000 ? 1 : 0,
    );
    expect(events('publicationCaptureComplete')).toHaveLength(0);
  },
);
it.each([30000, 30001])(
  'requires ACK within 30 seconds even after modal binding: %i ms',
  async (age) => {
    let release: ((response: unknown) => void) | undefined;
    const originalSend = send.getMockImplementation();
    if (!originalSend) throw new Error('Missing sender implementation');
    send.mockImplementation(async (request) => {
      if (requestData(request)?.event === 'publicationCaptureReplyIntent')
        return new Promise((resolve) => {
          release = resolve;
        });
      return originalSend(request);
    });
    await attach();
    trusted(required('article > [data-testid="reply"]'));
    await flush();
    vi.stubGlobal('location', new URL('https://x.com/compose/post'));
    document.body.insertAdjacentHTML('beforeend', replyModal);
    window.dispatchEvent(new Event('genfeed-publication-navigation'));
    await flush();
    await vi.advanceTimersByTimeAsync(age);
    if (!release) throw new Error('Missing deferred ACK');
    release({
      success: true,
      data: {
        kind: 'reply-intent',
        intentId: '22222222-2222-4222-8222-222222222222',
      },
    });
    await flush();
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(
      age === 30000 ? 1 : 0,
    );
    expect(events('publicationCaptureComplete')).toHaveLength(0);
    if (age === 30001)
      expect(
        requestData(events('publicationCaptureReplyIntentCancel')[0][0])
          ?.intentId,
      ).toBe('22222222-2222-4222-8222-222222222222');
  },
);
it.each([1500, 60001])(
  'uses the fresh submission window after 599 seconds of composition: observation +%i ms',
  async (delay) => {
    await attach();
    await openReply();
    await vi.advanceTimersByTimeAsync(599000);
    const submittedAt = Date.now();
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(delay);
    required('[role="dialog"]').remove();
    vi.stubGlobal('location', new URL('https://x.com/other/status/123'));
    window.dispatchEvent(new Event('genfeed-publication-navigation'));
    document.body.insertAdjacentHTML(
      'beforeend',
      ownReply.replace(
        '2026-10-03T00:00:00Z',
        new Date(Date.now()).toISOString(),
      ),
    );
    await flush();
    await vi.advanceTimersByTimeAsync(400);
    expect(events('publicationCaptureComplete')).toHaveLength(
      delay === 1500 ? 1 : 0,
    );
    if (delay === 1500) {
      expect(
        requestData(events('publicationCaptureBegin')[0][0])?.attempt,
      ).toMatchObject({ startedAt: submittedAt });
      expect(
        requestData(events('publicationCaptureComplete')[0][0])?.observation,
      ).toMatchObject({
        publicationDate: new Date(submittedAt + delay).toISOString(),
      });
    }
  },
);

function deferContexts() {
  const resolves: Array<(response: unknown) => void> = [];
  const rejects: Array<(error: Error) => void> = [];
  const originalSend = send.getMockImplementation();
  if (!originalSend) throw new Error('Missing sender implementation');
  send.mockImplementation(async (request) => {
    if (requestData(request)?.event === 'publicationCaptureContext')
      return new Promise((resolve, reject) => {
        resolves.push(resolve);
        rejects.push(reject);
      });
    return originalSend(request);
  });
  return {
    resolve(index: number, response: unknown) {
      const resolve = resolves[index];
      if (!resolve) throw new Error('Missing deferred Context');
      resolve(response);
    },
    reject(index: number) {
      const reject = rejects[index];
      if (!reject) throw new Error('Missing deferred Context');
      reject(new Error('Context transport failed'));
    },
  };
}
const verifiedContext = () => ({
  success: true,
  data: {
    kind: 'context',
    enabled: true,
    scope: { ...scope },
    pending: null,
    confirmed: null,
  },
});
it('retains the original acknowledged binding while deferred focus verification overlaps typing', async () => {
  await attach();
  await openReply();
  const deferred = deferContexts();
  window.dispatchEvent(new Event('focus'));
  required('[data-testid="tweetTextarea_0"]').append(
    document.createTextNode(' after focus'),
  );
  await flush();
  expect(events('publicationCaptureReplyIntent')).toHaveLength(1);
  expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(0);
  expect(events('publicationCaptureBegin')).toHaveLength(0);
  deferred.resolve(0, verifiedContext());
  await flush();
  const submittedAt = Date.now();
  await submit();
  expect(events('publicationCaptureBegin')).toHaveLength(1);
  expect(
    requestData(events('publicationCaptureBegin')[0][0])?.attempt,
  ).toMatchObject({
    startedAt: submittedAt,
    scope,
    description: 'Own authored reply after focus',
    surface: {
      kind: 'x-reply-modal',
      replyIntentId: '22222222-2222-4222-8222-222222222222',
      parent: { externalId: '123', url: 'https://x.com/other/status/123' },
    },
  });
  required('[role="dialog"]').remove();
  vi.stubGlobal('location', new URL('https://x.com/other/status/123'));
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  document.body.insertAdjacentHTML(
    'beforeend',
    ownReply
      .replace('Own authored reply', 'Own authored reply after focus')
      .replace('2026-10-03T00:00:00Z', new Date(submittedAt).toISOString()),
  );
  await flush();
  await vi.advanceTimersByTimeAsync(400);
  expect(events('publicationCaptureComplete')).toHaveLength(1);
});

it.each([
  'disabled',
  'null-scope',
  'user',
  'organization',
  'brand',
  'revision',
  'failure',
  'rejection',
  'wrong-kind',
])(
  'cancels current invalid deferred Context %s and cannot resurrect on a later valid refresh',
  async (kind) => {
    await attach();
    await openReply();
    const deferred = deferContexts();
    window.dispatchEvent(new Event('focus'));
    await flush();
    const response = verifiedContext();
    if (kind === 'disabled') response.data.enabled = false;
    if (kind === 'user') response.data.scope.userId = 'other';
    if (kind === 'organization') response.data.scope.organizationId = 'other';
    if (kind === 'brand') response.data.scope.brandId = 'other';
    if (kind === 'revision') response.data.scope.revision++;
    if (kind === 'rejection') deferred.reject(0);
    else
      deferred.resolve(
        0,
        kind === 'null-scope'
          ? { ...response, data: { ...response.data, scope: null } }
          : kind === 'failure'
            ? { success: false, error: 'Workspace unavailable' }
            : kind === 'wrong-kind'
              ? { success: true, data: { kind: 'queued' } }
              : response,
      );
    await flush();
    expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
    window.dispatchEvent(new Event('focus'));
    deferred.resolve(1, verifiedContext());
    await flush();
    await submit();
    expect(events('publicationCaptureReplyIntent')).toHaveLength(1);
    expect(events('publicationCaptureBegin')).toHaveLength(0);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
  },
);
it('trusted submit with unknown Context cancels without automatic resubmission after verification', async () => {
  await attach();
  await openReply();
  const deferred = deferContexts();
  window.dispatchEvent(new Event('focus'));
  await submit();
  expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
  expect(events('publicationCaptureBegin')).toHaveLength(0);
  deferred.resolve(0, verifiedContext());
  await flush();
  await vi.advanceTimersByTimeAsync(400);
  expect(events('publicationCaptureBegin')).toHaveLength(0);
  expect(events('publicationCaptureComplete')).toHaveLength(0);
  await submit();
  expect(events('publicationCaptureBegin')).toHaveLength(0);
});
it.each(['actor', 'route', 'editor', 'submit', 'expiry'])(
  'cancels locally invalid %s binding during unknown Context before resolution',
  async (kind) => {
    await attach();
    await openReply();
    const deferred = deferContexts();
    window.dispatchEvent(new Event('focus'));
    if (kind === 'actor')
      required('[data-testid="SideNav_AccountSwitcher_Button"]').textContent =
        '@other';
    if (kind === 'route') {
      vi.stubGlobal('location', new URL('https://x.com/notifications'));
      window.dispatchEvent(new Event('genfeed-publication-navigation'));
    }
    if (kind === 'editor' || kind === 'submit') {
      const selector =
        kind === 'editor'
          ? '[data-testid="tweetTextarea_0"]'
          : '[data-testid="tweetButton"]';
      required(selector).replaceWith(required(selector).cloneNode(true));
    }
    if (kind === 'expiry') {
      await vi.advanceTimersByTimeAsync(600001);
      required('[data-testid="tweetTextarea_0"]').append(
        document.createTextNode(' expired'),
      );
    }
    await flush();
    expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
    deferred.resolve(0, verifiedContext());
    await flush();
    if (kind === 'actor')
      required('[data-testid="SideNav_AccountSwitcher_Button"]').textContent =
        '@author';
    vi.stubGlobal('location', new URL('https://x.com/compose/post'));
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(0);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
  },
);
it('current successful Context rechecks visibility even without a mutation callback', async () => {
  await attach();
  await openReply();
  const deferred = deferContexts();
  window.dispatchEvent(new Event('focus'));
  required('[role="dialog"]').setAttribute('aria-hidden', 'true');
  await flush();
  expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(0);
  deferred.resolve(0, verifiedContext());
  await flush();
  expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
  required('[role="dialog"]').removeAttribute('aria-hidden');
  await submit();
  expect(events('publicationCaptureBegin')).toHaveLength(0);
});
it.each(['disabled', 'failure'])(
  'older enabled Context cannot override newer %s',
  async (kind) => {
    await attach();
    await openReply();
    const deferred = deferContexts();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    const newer = verifiedContext();
    newer.data.enabled = false;
    deferred.resolve(
      1,
      kind === 'disabled'
        ? newer
        : { success: false, error: 'Newer verification failed' },
    );
    await flush();
    deferred.resolve(0, verifiedContext());
    await flush();
    await submit();
    expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
    expect(events('publicationCaptureBegin')).toHaveLength(0);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
  },
);
it.each(['failure', 'rejection'])(
  'older %s Context cannot cancel binding verified by newer same-scope success',
  async (kind) => {
    await attach();
    await openReply();
    const deferred = deferContexts();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    deferred.resolve(1, verifiedContext());
    await flush();
    if (kind === 'rejection') deferred.reject(0);
    else
      deferred.resolve(0, {
        success: false,
        error: 'Older verification failed',
      });
    await flush();
    expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(0);
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(1);
    expect(events('publicationCaptureReplyIntent')).toHaveLength(1);
  },
);
it.each(['close', 'disposal'])(
  'deferred Context after %s cannot restore binding',
  async (kind) => {
    await attach();
    await openReply();
    const deferred = deferContexts();
    window.dispatchEvent(new Event('focus'));
    if (kind === 'close') trusted(required('[data-testid="app-bar-close"]'));
    else stop?.();
    expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
    deferred.resolve(0, verifiedContext());
    await flush();
    if (kind === 'close') await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(0);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
  },
);
it.each(['unbound', 'unacknowledged'])(
  'unknown Context never grants initial %s association or token authorization',
  async (kind) => {
    await attach();
    let release: ((response: unknown) => void) | undefined;
    const originalSend = send.getMockImplementation();
    if (!originalSend) throw new Error('Missing sender implementation');
    if (kind === 'unacknowledged')
      send.mockImplementation(async (request) => {
        if (requestData(request)?.event === 'publicationCaptureReplyIntent')
          return new Promise((resolve) => {
            release = resolve;
          });
        return originalSend(request);
      });
    trusted(required('article > [data-testid="reply"]'));
    await flush();
    if (kind === 'unacknowledged') {
      vi.stubGlobal('location', new URL('https://x.com/compose/post'));
      document.body.insertAdjacentHTML('beforeend', replyModal);
      window.dispatchEvent(new Event('genfeed-publication-navigation'));
      await flush();
    }
    const deferred = deferContexts();
    window.dispatchEvent(new Event('focus'));
    if (kind === 'unbound') {
      vi.stubGlobal('location', new URL('https://x.com/compose/post'));
      document.body.insertAdjacentHTML('beforeend', replyModal);
    } else
      required('[data-testid="tweetTextarea_0"]').append(
        document.createTextNode(' pending'),
      );
    await flush();
    deferred.resolve(0, verifiedContext());
    await flush();
    if (kind === 'unacknowledged') {
      if (!release) throw new Error('Missing deferred ACK');
      release({
        success: true,
        data: {
          kind: 'reply-intent',
          intentId: '22222222-2222-4222-8222-222222222222',
        },
      });
      await flush();
    }
    await submit();
    expect(events('publicationCaptureBegin')).toHaveLength(0);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
    expect(events('publicationCaptureReplyIntentCancel')).toHaveLength(1);
  },
);
it.each(['plain', 'tweet'])(
  'rejects an original Reply inside a synthetic outer %s article and preserves the top-level target',
  async (kind) => {
    const inner = required('article');
    const outer = document.createElement('article');
    if (kind === 'tweet') {
      outer.setAttribute('data-testid', 'tweet');
      outer.setAttribute('role', 'article');
    }
    inner.replaceWith(outer);
    outer.append(inner);
    const control = required('article > [data-testid="reply"]');
    expect(findXPublicationReplyTarget(control)).toBeNull();
    await attach();
    trusted(control);
    await flush();
    expect(events('publicationCaptureReplyIntent')).toHaveLength(0);
    expect(events('publicationCaptureBegin')).toHaveLength(0);
    expect(events('publicationCaptureComplete')).toHaveLength(0);
    outer.replaceWith(inner);
    expect(findXPublicationReplyTarget(control)?.parent).toEqual({
      externalId: '123',
      url: 'https://x.com/other/status/123',
    });
  },
);
