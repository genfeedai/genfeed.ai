import type { PublicationCaptureAttempt } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  snapshot: {
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    revision: 1,
  },
  status: 'ready',
  request: vi.fn(),
  requireWorkspace: vi.fn(),
  subscribe: vi.fn((_listener: () => void) => () => undefined),
}));
vi.mock('~services/workspace.service', () => ({
  getWorkspaceState: () => ({ status: mocks.status, snapshot: mocks.snapshot }),
  requireWorkspace: mocks.requireWorkspace,
  assertWorkspace: (expected: typeof mocks.snapshot) => {
    if (
      mocks.status !== 'ready' ||
      JSON.stringify(expected) !== JSON.stringify(mocks.snapshot)
    )
      throw new Error('Scope changed');
  },
  scopedWorkspaceRequest: mocks.request,
  subscribeWorkspace: mocks.subscribe,
}));
const OUTBOX = 'genfeed-publication-outbox-v1';
const WRITTEN = 'genfeed-publication-written-v1';
let local: Record<string, unknown>;
let session: Record<string, unknown>;
let failSave = false;
let failDelete = false;
let failSession = false;
function tab(id: number): chrome.tabs.Tab {
  return {
    id,
    index: 0,
    windowId: 1,
    highlighted: false,
    active: true,
    pinned: false,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    groupId: -1,
    frozen: false,
    lastAccessed: Date.now(),
  };
}
const source = {
  id: 'ext',
  tab: tab(1),
  frameId: 0,
  url: 'https://www.linkedin.com/feed/',
};
const ORIGIN = 'https://www.linkedin.com';
const POST = 'urn:li:activity:7100000000000000001';
const COMMENT =
  'urn:li:comment:(activity:7100000000000000001,7100000000000000002)';
const permalink = `${ORIGIN}/feed/update/${POST}/`;
const commentLink = `${ORIGIN}/feed/update/${POST}/?commentUrn=${encodeURIComponent(COMMENT)}`;
const result = {
  postId: 'post',
  created: true,
  source: 'extension',
  externalId: null,
  url: permalink,
  contextUrl: null,
  urlKind: 'permalink',
  credentialId: null,
  analyticsAvailability: 'provider-id-unresolved',
  observedVisibility: 'unknown',
  urlIdentity: { kind: 'linkedin-activity', value: POST },
};
let service: typeof import('~services/publication-capture.service');
const postAttempt = (
  description = 'Own authored text',
): PublicationCaptureAttempt => ({
  id: '11111111-1111-4111-8111-111111111111',
  scope: { ...mocks.snapshot },
  startedAt: Date.now(),
  documentUrl: `${ORIGIN}/feed/`,
  surface: { kind: 'linkedin-post' },
  authorHandle: null,
  description,
  baselineIds: ['urn:li:activity:7000000000000000009'],
});
const replyAttempt = (): PublicationCaptureAttempt => ({
  ...postAttempt('Own reply'),
  surface: {
    kind: 'linkedin-comment',
    parent: { externalId: POST, url: permalink },
  },
  baselineIds: [POST],
});
const observe = (
  original: PublicationCaptureAttempt,
  change: Record<string, unknown> = {},
) => ({
  attemptId: original.id,
  externalId: POST,
  url: permalink,
  authorHandle: 'own-author',
  description: original.description,
  publicationDate: new Date(original.startedAt + 1000).toISOString(),
  ...change,
});
beforeEach(async () => {
  vi.resetModules();
  mocks.status = 'ready';
  mocks.requireWorkspace.mockReset().mockImplementation(async () => {
    if (mocks.status === 'ready') return mocks.snapshot;
    throw new Error(
      mocks.status === 'refreshing'
        ? 'Workspace verification pending'
        : 'Workspace blocked',
    );
  });
  mocks.snapshot = {
    userId: 'user',
    organizationId: 'org',
    brandId: 'brand',
    revision: 1,
  };
  local = {};
  session = {
    [WRITTEN]: {},
  };
  failSave = false;
  failDelete = false;
  failSession = false;
  Object.assign(chrome, {
    runtime: {
      id: 'ext',
      getURL: (path: string) => `chrome-extension://ext/${path}`,
    },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: structuredClone(local[key]),
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          if (failSave && value[OUTBOX]) throw new Error('quota');
          if (
            failDelete &&
            Array.isArray(value[OUTBOX]) &&
            value[OUTBOX].length === 0
          )
            throw new Error('quota');
          Object.assign(local, structuredClone(value));
        }),
      },
      session: {
        get: vi.fn(async (key: string) => ({
          [key]: structuredClone(session[key]),
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          if (failSession) throw new Error('session quota');
          Object.assign(session, structuredClone(value));
        }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  mocks.request.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: result }),
  });
  service = await import('~services/publication-capture.service');
});
const handle = (request: unknown, sender = source) =>
  service.handlePublicationCaptureMessage(request, sender);
/** What the content script reports after the extension inserts text into a LinkedIn composer. */
const written = (text: string, sender = source) =>
  service.registerExtensionWrittenText(text, sender);
const recordedParameters = () =>
  JSON.parse(String(mocks.request.mock.calls[0][1].body)).parameters;
async function publish(original: PublicationCaptureAttempt, change = {}) {
  expect(
    (await handle({ event: 'publicationCaptureBegin', attempt: original }))
      .success,
  ).toBe(true);
  return handle({
    event: 'publicationCaptureComplete',
    observation: observe(original, change),
  });
}

it('records a LinkedIn post written with the extension by its confirmed URL alone', async () => {
  expect(await written('Own authored text')).toBe(true);
  const reply = await publish(postAttempt());
  expect(reply).toMatchObject({
    success: true,
    data: { kind: 'recorded', result: { created: true } },
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(recordedParameters()).toEqual({
    brandId: 'brand',
    platform: 'linkedin',
    publicationKind: 'post',
    description: 'Own authored text',
    publicationDate: expect.any(String),
    url: permalink,
    author: { handle: 'own-author' },
    observedVisibility: 'unknown',
  });
  expect(local[OUTBOX]).toEqual([]);
});

it('sends the provider id only when the permalink already carries a share or UGC URN', async () => {
  await written('Own authored text');
  const share = 'urn:li:share:7100000000000000003';
  await publish(postAttempt(), {
    externalId: share,
    url: `${ORIGIN}/feed/update/${share}/`,
    authorHandle: null,
  });
  expect(recordedParameters()).toEqual({
    brandId: 'brand',
    platform: 'linkedin',
    publicationKind: 'post',
    description: 'Own authored text',
    publicationDate: expect.any(String),
    url: `${ORIGIN}/feed/update/${share}/`,
    externalId: share,
    observedVisibility: 'unknown',
  });
});

it('records a LinkedIn reply written with the extension by its comment permalink', async () => {
  await written('Own reply');
  const original = replyAttempt();
  expect(
    await publish(original, { externalId: COMMENT, url: commentLink }),
  ).toMatchObject({
    success: true,
    data: { kind: 'recorded' },
  });
  expect(recordedParameters()).toEqual({
    brandId: 'brand',
    platform: 'linkedin',
    publicationKind: 'reply',
    description: 'Own reply',
    publicationDate: expect.any(String),
    url: commentLink,
    author: { handle: 'own-author' },
    observedVisibility: 'unknown',
  });
});

it('never arms, records or uploads LinkedIn text the extension did not write', async () => {
  // Another tab, another site and an older text do not authorize this one.
  await written('Something else entirely');
  await written('Own authored text', { ...source, tab: tab(2) });
  await written('Own authored text', { ...source, url: 'https://x.com/home' });
  const original = postAttempt();
  expect(
    await handle({ event: 'publicationCaptureBegin', attempt: original }),
  ).toEqual({
    success: false,
    error: 'Not written with Genfeed',
  });
  expect(
    (
      await handle({
        event: 'publicationCaptureComplete',
        observation: observe(original),
      })
    ).success,
  ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(session['genfeed-publication-pending-v1']).toBeUndefined();
  expect(local[OUTBOX]).toBeUndefined();
});

it('a duplicate completion of the same publication sends one request', async () => {
  await written('Own authored text');
  const original = postAttempt();
  await handle({ event: 'publicationCaptureBegin', attempt: original });
  const complete = {
    event: 'publicationCaptureComplete',
    observation: observe(original),
  };
  const [first, second] = await Promise.all([
    handle(complete),
    handle(complete),
  ]);
  expect(first.success).toBe(true);
  expect(second.success).toBe(true);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it('rejects an observation that is not the armed publication', async () => {
  await written('Own authored text');
  const original = postAttempt();
  await handle({ event: 'publicationCaptureBegin', attempt: original });
  for (const change of [
    { description: 'Different text' },
    {
      externalId: 'urn:li:activity:7000000000000000009',
      url: `${ORIGIN}/feed/update/urn:li:activity:7000000000000000009/`,
    },
    { externalId: COMMENT, url: commentLink },
    { url: `${permalink}#frag` },
    { url: 'https://x.com/author/status/456' },
    { authorHandle: 'bad handle' },
  ])
    expect(
      (
        await handle({
          event: 'publicationCaptureComplete',
          observation: observe(original, change),
        })
      ).success,
    ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});

it('reports a LinkedIn recording failure by name and keeps the recording for retry', async () => {
  await written('Own authored text');
  mocks.request.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
  });
  expect(await publish(postAttempt())).toEqual({
    success: false,
    error:
      'Published on LinkedIn; recording failed. Retry in Genfeed Settings.',
  });
  expect(local[OUTBOX]).toEqual([
    expect.objectContaining({
      status: 'failed',
      input: expect.objectContaining({ platform: 'linkedin', url: permalink }),
    }),
  ]);
});
