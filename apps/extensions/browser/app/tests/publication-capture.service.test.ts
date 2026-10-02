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
const CONFIRMED = 'genfeed-publication-confirmed-v1';
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
  url: 'https://x.com/home',
};
const extension = { id: 'ext', url: 'chrome-extension://ext/sidepanel.html' };
const result = {
  postId: 'post',
  created: true,
  source: 'extension',
  externalId: '456',
  url: 'https://x.com/author/status/456',
  contextUrl: null,
  urlKind: 'permalink',
  credentialId: null,
  analyticsAvailability: 'missing-credential',
  observedVisibility: 'unknown',
  urlIdentity: { kind: 'platform-publication-id', value: '456' },
};
let service: typeof import('~services/publication-capture.service');
const attempt = (): PublicationCaptureAttempt => ({
  id: '11111111-1111-4111-8111-111111111111',
  scope: { ...mocks.snapshot },
  startedAt: Date.now(),
  documentUrl: 'https://x.com/home',
  surface: { kind: 'x-home' },
  authorHandle: 'author',
  description: 'Own authored text',
  baselineIds: ['123'],
});
const observation = (original: PublicationCaptureAttempt) => ({
  attemptId: original.id,
  externalId: '456',
  url: 'https://x.com/author/status/456',
  authorHandle: 'author',
  description: original.description,
  publicationDate: new Date(original.startedAt).toISOString(),
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
  session = {};
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
async function begin(original = attempt()) {
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureBegin', attempt: original },
        source,
      )
    ).success,
  ).toBe(true);
  return original;
}
it('allows dormant HTTPS context without arming a home publication', async () => {
  const sender = { ...source, url: 'https://x.com/other' };
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureContext' },
      sender,
    ),
  ).toEqual({
    success: true,
    data: {
      kind: 'context',
      enabled: true,
      scope: { ...mocks.snapshot },
      pending: null,
      confirmed: null,
    },
  });
  const original = attempt();
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureBegin', attempt: original },
        sender,
      )
    ).success,
  ).toBe(false);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureComplete',
          observation: observation(original),
        },
        sender,
      )
    ).success,
  ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(session['genfeed-publication-pending-v1']).toBeUndefined();
  expect(local[OUTBOX]).toBeUndefined();
});
it('rejects forged sender, subframe, origin, body scope and content outbox access', async () => {
  for (const sender of [
    { ...source, id: 'other' },
    { ...source, frameId: 1 },
    { ...source, tab: tab(-1) },
    { ...source, url: 'https://evil.example/home' },
    { ...source, url: 'http://x.com/other' },
  ])
    expect(
      (
        await service.handlePublicationCaptureMessage(
          { event: 'publicationCaptureContext' },
          sender,
        )
      ).success,
    ).toBe(false);
  const original = attempt();
  original.scope.organizationId = 'foreign';
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureBegin', attempt: original },
        source,
      )
    ).success,
  ).toBe(false);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureList' },
        source,
      )
    ).success,
  ).toBe(false);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureContext', tabId: 2 },
        source,
      )
    ).success,
  ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});
it('persists confirmed own observation before canonicalAPI and preserves original scope/text/date', async () => {
  const original = await begin();
  mocks.request.mockImplementationOnce(async () => {
    expect(local[OUTBOX]).toEqual([
      expect.objectContaining({
        sourceBinding: { tabId: 1, origin: 'https://x.com' },
        input: expect.objectContaining({ description: original.description }),
      }),
    ]);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: result }),
    };
  });
  const response = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  expect(response).toEqual({
    success: true,
    data: { kind: 'recorded', attemptId: original.id, result },
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  const [url, options] = mocks.request.mock.calls[0];
  expect(url).toContain('/agent-tools/record_external_publication/execute');
  expect(JSON.parse(options.body)).toEqual({
    parameters: expect.objectContaining({
      brandId: 'brand',
      description: original.description,
      publicationDate: observation(original).publicationDate,
      platform: 'twitter',
      publicationKind: 'post',
      author: { handle: 'author' },
      observedVisibility: 'unknown',
    }),
    context: { brandId: 'brand' },
  });
  expect(local[OUTBOX]).toEqual([]);
});
it('quota failure makes zeroAPI calls and retains the exact pending attempt for retry', async () => {
  const original = await begin();
  failSave = true;
  const reply = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  expect(reply).toEqual({
    success: false,
    error:
      'Could not save this recording. Keep this tab open and select Retry recording. Closing the browser may lose it.',
  });
  expect(mocks.request).not.toHaveBeenCalled();
  expect(session[CONFIRMED]).toBeDefined();
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureContext' },
      source,
    ),
  ).toMatchObject({
    success: true,
    data: { confirmed: { observation: observation(original) }, pending: null },
  });
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureContext' },
      { ...source, tab: tab(2) },
    ),
  ).toMatchObject({ success: true, data: { confirmed: null } });
  failSave = false;
  vi.spyOn(Date, 'now').mockReturnValue(original.startedAt + 120000);
  mocks.snapshot = { ...mocks.snapshot, revision: 2 };
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureComplete',
          observation: observation(original),
        },
        source,
      )
    ).success,
  ).toBe(true);
  vi.restoreAllMocks();
});
it('simultaneousComplete and Retry share one in-flightAPI request', async () => {
  const original = await begin();
  let finish!: (response: unknown) => void;
  mocks.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  await vi.waitFor(() => expect(finish).toBeDefined());
  for (const other of [
    { ...source, tab: tab(2) },
    { ...source, url: 'https://twitter.com/home' },
  ]) {
    expect(
      (
        await service.handlePublicationCaptureMessage(
          {
            event: 'publicationCaptureComplete',
            observation: observation(original),
          },
          other,
        )
      ).success,
    ).toBe(false);
  }
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureComplete',
          observation: { ...observation(original), description: 'conflict' },
        },
        source,
      )
    ).success,
  ).toBe(false);
  const second = service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  const retry = service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureRetry', id: original.id },
    extension,
  );
  finish({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: result }),
  });
  await Promise.all([first, second, retry]);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('unknown-action remains durable; next-day same-scope retry uses originaldate despite a fresh revision', async () => {
  const original = await begin();
  mocks.request.mockResolvedValueOnce({
    ok: false,
    status: 404,
    json: async () => ({ success: false, error: 'Unknown action' }),
  });
  expect(
    await service.handlePublicationCaptureMessage(
      {
        event: 'publicationCaptureComplete',
        observation: observation(original),
      },
      source,
    ),
  ).toEqual({
    success: false,
    error:
      'Recording is not available on this server yet. Retry after Genfeed is updated.',
  });
  mocks.snapshot = { ...mocks.snapshot, revision: 2 };
  vi.spyOn(Date, 'now').mockReturnValue(original.startedAt + 86400001);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureRetry', id: original.id },
        extension,
      )
    ).success,
  ).toBe(true);
  expect(
    JSON.parse(mocks.request.mock.calls[1][1].body).parameters.publicationDate,
  ).toBe(observation(original).publicationDate);
  vi.restoreAllMocks();
});
it('off retains establishedoutbox, hides foreignscope text and requires enabledsame-scope retry', async () => {
  const original = await begin();
  mocks.request.mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({}),
  });
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  local['genfeed-settings'] = { recordOwnPublications: false };
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureRetry', id: original.id },
        extension,
      )
    ).success,
  ).toBe(false);
  expect(local[OUTBOX]).toHaveLength(1);
  mocks.snapshot = { ...mocks.snapshot, organizationId: 'other' };
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureList' },
      extension,
    ),
  ).toEqual({
    success: true,
    data: { kind: 'list', entries: [], enabled: false },
  });
});
it('rejects mismatched own identity/text/timestamp, ambiguouspending and stale workspace withoutAPI', async () => {
  const original = await begin();
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureBegin',
          attempt: { ...original, id: '22222222-2222-4222-8222-222222222222' },
        },
        source,
      )
    ).success,
  ).toBe(false);
  for (const change of [
    { authorHandle: 'other' },
    { description: 'changed' },
    { externalId: '123' },
    { publicationDate: new Date(original.startedAt - 2000).toISOString() },
    { url: 'https://x.com/other/status/456' },
  ])
    expect(
      (
        await service.handlePublicationCaptureMessage(
          {
            event: 'publicationCaptureComplete',
            observation: { ...observation(original), ...change },
          },
          source,
        )
      ).success,
    ).toBe(false);
  mocks.snapshot = { ...mocks.snapshot, revision: 2 };
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureComplete',
          observation: observation(original),
        },
        source,
      )
    ).success,
  ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});
it('preserves corrupt storage rather than overwriting unknown entries', async () => {
  local[OUTBOX] = { unknown: 'retained' };
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureList' },
        extension,
      )
    ).success,
  ).toBe(false);
  expect(local[OUTBOX]).toEqual({ unknown: 'retained' });
});
it('successful API with deletionfailure remains replay-safe and preserves returnedoriginalsource', async () => {
  const original = await begin();
  failDelete = true;
  const reply = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  expect(reply.success).toBe(true);
  expect(local[OUTBOX]).toHaveLength(1);
  failDelete = false;
  failSession = false;
  mocks.request.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: { ...result, created: false, source: 'original-source' },
    }),
  });
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureRetry', id: original.id },
      extension,
    ),
  ).toEqual({
    success: true,
    data: {
      kind: 'recorded',
      attemptId: original.id,
      result: { ...result, created: false, source: 'original-source' },
    },
  });
});
it('reload recovers recording entries toqueued and refreshing suspends mutation', async () => {
  const original = await begin();
  mocks.request.mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({}),
  });
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  const entries = local[OUTBOX] as { status: string }[];
  entries[0].status = 'recording';
  service.initializePublicationCapture();
  await vi.waitFor(() =>
    expect((local[OUTBOX] as { status: string }[])[0].status).toBe('queued'),
  );
  mocks.status = 'refreshing';
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureRetry', id: original.id },
        extension,
      )
    ).success,
  ).toBe(false);
});

it('existing failed Complete never retries; late removed Complete makes zero additional calls', async () => {
  const original = await begin();
  mocks.request.mockResolvedValueOnce({
    ok: false,
    status: 503,
    json: async () => ({}),
  });
  const message = {
    event: 'publicationCaptureComplete',
    observation: observation(original),
  };
  await service.handlePublicationCaptureMessage(message, source);
  expect(
    await service.handlePublicationCaptureMessage(message, source),
  ).toEqual({
    success: true,
    data: { kind: 'queued', attemptId: original.id },
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureRetry', id: original.id },
    extension,
  );
  expect(
    (await service.handlePublicationCaptureMessage(message, source)).success,
  ).toBe(false);
  expect(mocks.request).toHaveBeenCalledTimes(2);
});
it('session confirmation survives restart, closed tab and fresh revision; scoped Settings explicitly promotes it', async () => {
  const original = await begin();
  failSave = true;
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  vi.resetModules();
  service = await import('~services/publication-capture.service');
  vi.spyOn(Date, 'now').mockReturnValue(original.startedAt + 86400001);
  mocks.snapshot = { ...mocks.snapshot, revision: 3 };
  const list = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureList' },
    extension,
  );
  expect(list).toMatchObject({
    success: true,
    data: {
      entries: [
        {
          id: original.id,
          error:
            'Not saved for durable retry. Keep the browser open and retry.',
        },
      ],
    },
  });
  mocks.snapshot = { ...mocks.snapshot, userId: 'foreign' };
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureList' },
      extension,
    ),
  ).toMatchObject({ success: true, data: { entries: [] } });
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureRetry', id: original.id },
        extension,
      )
    ).success,
  ).toBe(false);
  mocks.snapshot = { ...mocks.snapshot, userId: 'user' };
  local['genfeed-settings'] = { recordOwnPublications: false };
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureRetry', id: original.id },
        extension,
      )
    ).success,
  ).toBe(false);
  expect(session[CONFIRMED]).toHaveProperty(original.id);
  local['genfeed-settings'] = { recordOwnPublications: true };
  failSave = false;
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureRetry', id: original.id },
        extension,
      )
    ).success,
  ).toBe(true);
  expect(
    JSON.parse(mocks.request.mock.calls[0][1].body).parameters.publicationDate,
  ).toBe(observation(original).publicationDate);
  expect(session[CONFIRMED]).toEqual({});
  expect(local[OUTBOX]).toEqual([]);
  vi.restoreAllMocks();
});
it('both storage writes failing retain only honest in-memory recovery and explicit Dismiss clears it', async () => {
  const original = await begin();
  failSave = true;
  failSession = true;
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureComplete',
          observation: observation(original),
        },
        source,
      )
    ).success,
  ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(session[CONFIRMED]).toBeUndefined();
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureList' },
      extension,
    ),
  ).toMatchObject({
    success: true,
    data: { entries: [{ id: original.id, status: 'failed' }] },
  });
  failSave = false;
  failSession = false;
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureDismiss', id: original.id },
        extension,
      )
    ).success,
  ).toBe(true);
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureList' },
      extension,
    ),
  ).toMatchObject({ success: true, data: { entries: [] } });
});
it('malformed recovery journal remains unchanged and makes zero API calls', async () => {
  session[CONFIRMED] = { unknown: { injected: 'text' } };
  const prior = structuredClone(session[CONFIRMED]);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureList' },
        extension,
      )
    ).success,
  ).toBe(false);
  expect(session[CONFIRMED]).toEqual(prior);
  expect(mocks.request).not.toHaveBeenCalled();
});

it('unknown-tool 400 retains rollout guidance while validation errors remain ordinary failed records', async () => {
  const original = await begin();
  mocks.request.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({
      message: 'Unknown tool: record_external_publication',
    }),
  });
  expect(
    await service.handlePublicationCaptureMessage(
      {
        event: 'publicationCaptureComplete',
        observation: observation(original),
      },
      source,
    ),
  ).toMatchObject({
    success: false,
    error:
      'Recording is not available on this server yet. Retry after Genfeed is updated.',
  });
  mocks.request.mockResolvedValueOnce({
    ok: false,
    status: 400,
    json: async () => ({ error: 'Unknown publication visibility' }),
  });
  expect(
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureRetry', id: original.id },
      extension,
    ),
  ).toMatchObject({
    success: false,
    error: 'Published on X; recording failed. Retry in Genfeed Settings.',
  });
  expect(local[OUTBOX]).toHaveLength(1);
});

const PENDING = 'genfeed-publication-pending-v1';
function coldVerification() {
  mocks.status = 'loading';
  let ready!: () => void;
  let reject!: (error: Error) => void;
  const shared = new Promise<typeof mocks.snapshot>((resolve, fail) => {
    ready = () => {
      mocks.status = 'ready';
      resolve(mocks.snapshot);
    };
    reject = fail;
  });
  mocks.requireWorkspace.mockImplementation(() => shared);
  return { ready, reject };
}
it('cold Context and List await one shared verification before accessing current scope', async () => {
  const cold = coldVerification();
  let settled = 0;
  const context = service
    .handlePublicationCaptureMessage(
      { event: 'publicationCaptureContext' },
      source,
    )
    .then((value) => {
      settled++;
      return value;
    });
  const list = service
    .handlePublicationCaptureMessage(
      { event: 'publicationCaptureList' },
      extension,
    )
    .then((value) => {
      settled++;
      return value;
    });
  await Promise.resolve();
  expect(mocks.requireWorkspace).toHaveBeenCalledTimes(2);
  expect(settled).toBe(0);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(chrome.storage.session.set).not.toHaveBeenCalled();
  cold.ready();
  expect(await context).toMatchObject({
    success: true,
    data: { kind: 'context', scope: mocks.snapshot },
  });
  expect(await list).toMatchObject({
    success: true,
    data: { kind: 'list', entries: [] },
  });
});
it('rejected cold verification makes no API or journal mutation and preserves observations', async () => {
  const original = await begin();
  failSave = true;
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  const savedLocal = structuredClone(local);
  const savedSession = structuredClone(session);
  mocks.request.mockClear();
  vi.mocked(chrome.storage.session.set).mockClear();
  vi.mocked(chrome.storage.local.set).mockClear();
  const cold = coldVerification();
  const response = service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureRetry', id: original.id },
    extension,
  );
  cold.reject(new Error('Verification rejected'));
  expect(await response).toMatchObject({ success: false });
  expect(local).toEqual(savedLocal);
  expect(session).toEqual(savedSession);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(chrome.storage.session.set).not.toHaveBeenCalled();
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
});
it('refreshing rejects immediately and never automatically resumes recording after ready', async () => {
  const original = await begin();
  mocks.status = 'refreshing';
  const before = structuredClone(session);
  expect(
    await service.handlePublicationCaptureMessage(
      {
        event: 'publicationCaptureComplete',
        observation: observation(original),
      },
      source,
    ),
  ).toMatchObject({ success: false });
  mocks.status = 'ready';
  await Promise.resolve();
  expect(session).toEqual(before);
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each(['loading', 'refreshing'])(
  'enabled startup preserves pending and confirmed recovery during %s',
  async (status) => {
    const original = await begin();
    failSave = true;
    await service.handlePublicationCaptureMessage(
      {
        event: 'publicationCaptureComplete',
        observation: observation(original),
      },
      source,
    );
    const confirmed = structuredClone(session[CONFIRMED]);
    const prior = structuredClone(session[PENDING]);
    mocks.status = status;
    const stop = service.initializePublicationCapture();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session[PENDING]).toEqual(prior);
    expect(session[CONFIRMED]).toEqual(confirmed);
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.status = 'ready';
    mocks.snapshot = { ...mocks.snapshot, organizationId: 'other' };
    const cancel = mocks.subscribe.mock.calls.at(-1)?.[0];
    if (typeof cancel !== 'function')
      throw new Error('Missing workspace listener');
    cancel();
    await vi.waitFor(() => expect(session[PENDING]).toEqual({}));
    expect(original.scope.organizationId).toBe('org');
    stop();
  },
);
it('blocked verified state removes pending attempts after cold startup', async () => {
  await begin();
  mocks.status = 'loading';
  const stop = service.initializePublicationCapture();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(session[PENDING]).not.toEqual({});
  mocks.status = 'blocked';
  const cancel = mocks.subscribe.mock.calls.at(-1)?.[0];
  if (typeof cancel !== 'function')
    throw new Error('Missing workspace listener');
  cancel();
  await vi.waitFor(() => expect(session[PENDING]).toEqual({}));
  stop();
});
it.each(['loading', 'refreshing'])(
  'toggle off cancels pending immediately during %s without discarding durable outbox',
  async (status) => {
    const original = await begin();
    mocks.request.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    await service.handlePublicationCaptureMessage(
      {
        event: 'publicationCaptureComplete',
        observation: observation(original),
      },
      source,
    );
    await begin({ ...attempt(), id: '22222222-2222-4222-8222-222222222222' });
    const outbox = structuredClone(local[OUTBOX]);
    mocks.status = status;
    const stop = service.initializePublicationCapture();
    await new Promise((resolve) => setTimeout(resolve, 0));
    local['genfeed-settings'] = { recordOwnPublications: false };
    const storage = vi
      .mocked(chrome.storage.onChanged.addListener)
      .mock.calls.at(-1)?.[0];
    if (!storage) throw new Error('Missing settings listener');
    storage(
      { 'genfeed-settings': { newValue: { recordOwnPublications: false } } },
      'local',
    );
    await vi.waitFor(() => expect(session[PENDING]).toEqual({}));
    expect(local[OUTBOX]).toEqual(outbox);
    stop();
  },
);

const INTENTS = 'genfeed-publication-reply-intents-v1';

const replyInput = () => ({
  scope: { ...mocks.snapshot },
  createdAt: Date.now(),
  documentUrl: source.url,
  authorHandle: 'author',
  parent: { externalId: '123', url: 'https://x.com/other/status/123' },
});
async function registerReply() {
  const intent = replyInput();
  const reply = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureReplyIntent', intent },
    source,
  );
  if (!reply.success || reply.data.kind !== 'reply-intent')
    throw new Error('Expected reply intent');
  const original: PublicationCaptureAttempt = {
    ...attempt(),
    documentUrl: 'https://x.com/compose/post',
    surface: {
      kind: 'x-reply-modal',
      returnUrl: intent.documentUrl,
      replyIntentId: reply.data.intentId,
      parent: intent.parent,
    },
  };
  return original;
}
it('consumes one exact reply intent and pending attempt in one atomic session mutation', async () => {
  const original = await registerReply();
  vi.mocked(chrome.storage.session.set).mockClear();
  const armed = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureBegin', attempt: original },
    { ...source, url: 'https://x.com/compose/post' },
  );
  expect(armed.success).toBe(true);
  expect(chrome.storage.session.set).toHaveBeenCalledTimes(1);
  expect(chrome.storage.session.set).toHaveBeenCalledWith({
    [INTENTS]: {},
    [PENDING]: {
      '1': { tabId: 1, origin: 'https://x.com', attempt: original },
    },
  });
  expect(mocks.request).not.toHaveBeenCalled();
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureBegin',
          attempt: { ...original, id: crypto.randomUUID() },
        },
        source,
      )
    ).success,
  ).toBe(false);
});
it('failed atomic consumption preserves intent and never arms or calls the API', async () => {
  const original = await registerReply();
  const before = structuredClone(session);
  failSession = true;
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureBegin', attempt: original },
        source,
      )
    ).success,
  ).toBe(false);
  expect(session).toEqual(before);
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each([
  { id: 'other' },
  { frameId: 1 },
  { tab: tab(2) },
  { url: 'https://twitter.com/home' },
])(
  'rejects wrong runtime/frame/tab/origin for reply Begin: %j',
  async (change) => {
    const original = await registerReply();
    expect(
      (
        await service.handlePublicationCaptureMessage(
          { event: 'publicationCaptureBegin', attempt: original },
          { ...source, ...change },
        )
      ).success,
    ).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
it.each([
  { createdAt: Date.now() - 31000 },
  { authorHandle: 'bad handle' },
  {
    scope: {
      userId: 'other',
      organizationId: 'org',
      brandId: 'brand',
      revision: 1,
    },
  },
  { parent: { externalId: '999', url: 'https://x.com/other/status/123' } },
])('rejects malformed/stale/foreign reply registration: %j', async (change) => {
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureReplyIntent',
          intent: { ...replyInput(), ...change },
        },
        source,
      )
    ).success,
  ).toBe(false);
  expect(session[INTENTS]).toBeUndefined();
});
it('replacement and explicit cancellation invalidate only the exact tab-bound intent', async () => {
  const old = await registerReply();
  const fresh = await registerReply();
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureBegin', attempt: old },
        source,
      )
    ).success,
  ).toBe(false);
  if (fresh.surface.kind !== 'x-reply-modal') throw new Error('reply expected');
  await service.handlePublicationCaptureMessage(
    {
      event: 'publicationCaptureReplyIntentCancel',
      intentId: fresh.surface.replyIntentId,
    },
    { ...source, tab: tab(2) },
  );
  expect(session[INTENTS]).not.toEqual({});
  await service.handlePublicationCaptureMessage(
    {
      event: 'publicationCaptureReplyIntentCancel',
      intentId: fresh.surface.replyIntentId,
    },
    source,
  );
  expect(session[INTENTS]).toEqual({});
});
it('corrupt intent storage is rejected without overwrite', async () => {
  session[INTENTS] = { '1': { id: 'bad' } };
  const before = structuredClone(session);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureReplyIntent', intent: replyInput() },
        source,
      )
    ).success,
  ).toBe(false);
  expect(session).toEqual(before);
});
it('reply retains its own ID/kind/date in durable retry and rejects a parent Complete', async () => {
  const original = await registerReply();
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureBegin', attempt: original },
    source,
  );
  expect(
    (
      await service.handlePublicationCaptureMessage(
        {
          event: 'publicationCaptureComplete',
          observation: {
            ...observation(original),
            externalId: '123',
            url: 'https://x.com/author/status/123',
          },
        },
        source,
      )
    ).success,
  ).toBe(false);
  mocks.request.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({}),
  });
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureComplete', observation: observation(original) },
    source,
  );
  expect(local[OUTBOX]).toMatchObject([
    {
      input: {
        publicationKind: 'reply',
        externalId: '456',
        publicationDate: observation(original).publicationDate,
      },
    },
  ]);
  const clock = vi
    .spyOn(Date, 'now')
    .mockReturnValue(original.startedAt + 90000);
  try {
    mocks.request.mockClear();
    await service.handlePublicationCaptureMessage(
      {
        event: 'publicationCaptureComplete',
        observation: observation(original),
      },
      { ...source, url: 'https://x.com/notifications' },
    );
    expect(mocks.request).not.toHaveBeenCalled();
    await service.handlePublicationCaptureMessage(
      { event: 'publicationCaptureRetry', id: original.id },
      extension,
    );
    expect(
      JSON.parse(String(mocks.request.mock.calls[0][1].body)).parameters,
    ).toMatchObject({
      publicationKind: 'reply',
      publicationDate: observation(original).publicationDate,
      externalId: '456',
    });
  } finally {
    clock.mockRestore();
  }
});
it('restores legacy home pending without erasing malformed or modal-missing-surface storage', async () => {
  const { surface: _surface, ...legacy } = attempt();
  session[PENDING] = {
    '1': { tabId: 1, origin: 'https://x.com', attempt: legacy },
  };
  const response = await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureContext' },
    source,
  );
  expect(response).toMatchObject({
    success: true,
    data: { pending: { surface: { kind: 'x-home' } } },
  });
  session[PENDING] = {
    '1': {
      tabId: 1,
      origin: 'https://x.com',
      attempt: { ...legacy, documentUrl: 'https://x.com/compose/post' },
    },
  };
  const before = structuredClone(session);
  expect(
    (
      await service.handlePublicationCaptureMessage(
        { event: 'publicationCaptureContext' },
        source,
      )
    ).success,
  ).toBe(false);
  expect(session).toEqual(before);
});

it.each(['expired', 'actor', 'parent', 'scope'])(
  'rejects a validly parsed reply intent whose %s binding no longer matches',
  async (mismatch) => {
    const original = await registerReply();
    if (mismatch === 'expired') {
      const entries = await import(
        '~services/publication-capture-intents'
      ).then((module) => module.readPublicationReplyIntents());
      entries['1'].input.createdAt = Date.now() - 31000;
      session[INTENTS] = entries;
    }
    if (mismatch === 'actor') original.authorHandle = 'other';
    if (mismatch === 'parent' && original.surface.kind === 'x-reply-modal') {
      original.surface.parent = {
        externalId: '999',
        url: 'https://x.com/other/status/999',
      };
      original.baselineIds.push('999');
    }
    if (mismatch === 'scope') original.scope.revision++;
    expect(
      (
        await service.handlePublicationCaptureMessage(
          { event: 'publicationCaptureBegin', attempt: original },
          source,
        )
      ).success,
    ).toBe(false);
    expect(session[PENDING]).toBeUndefined();
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
it('tab updates retain compose/exact return pending and cancel unrelated routes without erasing durable recovery', async () => {
  const original = await registerReply();
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureBegin', attempt: original },
    source,
  );
  const dispose = service.initializePublicationCapture();
  const update = vi.mocked(chrome.tabs.onUpdated.addListener).mock
    .calls[0]?.[0];
  if (!update) throw new Error('Missing tab listener');
  update(1, { url: 'https://x.com/compose/post' }, tab(1));
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureContext' },
    { ...source, url: 'https://x.com/compose/post' },
  );
  expect(session[PENDING]).toMatchObject({
    '1': { attempt: { id: original.id } },
  });
  update(1, { url: 'https://x.com/home?different=1' }, tab(1));
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureContext' },
    source,
  );
  expect(session[PENDING]).toEqual({});
  dispose();
});
it('Complete cannot add or alter reply surface, parent, kind or source', async () => {
  const original = await registerReply();
  await service.handlePublicationCaptureMessage(
    { event: 'publicationCaptureBegin', attempt: original },
    source,
  );
  for (const forged of [
    { surface: { kind: 'x-home' } },
    { parent: { externalId: '123' } },
    { publicationKind: 'post' },
    { source: 'manual' },
  ])
    expect(
      (
        await service.handlePublicationCaptureMessage(
          {
            event: 'publicationCaptureComplete',
            observation: observation(original),
            ...forged,
          },
          source,
        )
      ).success,
    ).toBe(false);
  expect(mocks.request).not.toHaveBeenCalled();
});
