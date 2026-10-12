import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publication: vi.fn().mockResolvedValue({ success: false, error: 'Rejected' }),
  workspaceBrand: 'brand-1' as string | null,
  execute: vi.fn(),
  generateText: vi.fn(),
  refineText: vi.fn(),
  generateReplyVariants: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  addListener: vi.fn(),
  openPanel: vi.fn().mockResolvedValue(undefined),
  contextMenuListener: undefined as
    | ((info: object, tab: chrome.tabs.Tab) => void)
    | undefined,
}));
vi.mock('~services/publication-capture.service', () => ({
  initializePublicationCapture: vi.fn(),
  handlePublicationCaptureMessage: mocks.publication,
}));
vi.mock('~services/auth.service', () => ({
  authService: { getToken: mocks.getToken },
}));
vi.mock('~services/error-tracking.service', () => ({
  initializeErrorTracking: vi.fn(),
  captureExtensionError: vi.fn(),
}));
vi.mock('~services/agent-tools.service', () => ({
  AgentToolsService: class {
    execute = mocks.execute;
    generateText = mocks.generateText;
    refineText = mocks.refineText;
    generateReplyVariants = mocks.generateReplyVariants;
  },
}));

let backgroundListener: (
  request: Record<string, unknown>,
  sender: object,
  respond: (data: unknown) => void,
) => boolean | undefined;

beforeAll(async () => {
  vi.stubGlobal('fetch', mocks.fetch);
  Object.assign(chrome, {
    sidePanel: {
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
      open: mocks.openPanel,
    },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: mocks.addListener },
      sendMessage: vi.fn().mockResolvedValue(undefined),
    },
    contextMenus: {
      onClicked: {
        addListener: vi.fn((listener) => {
          mocks.contextMenuListener = listener;
        }),
      },
    },
    tabs: {
      create: vi.fn().mockResolvedValue({ id: 4 }),
      onUpdated: { addListener: vi.fn() },
      query: vi
        .fn()
        .mockResolvedValue([{ id: 1, url: 'https://x.com/author/status/123' }]),
    },
  });
  await import('../src/background');
  backgroundListener = mocks.addListener.mock.calls[0]?.[0];
  expect(backgroundListener).toBeTypeOf('function');
});

beforeEach(() => {
  mocks.workspaceBrand = 'brand-1';
  mocks.getToken.mockResolvedValue('token');
  mocks.generateText.mockReset().mockResolvedValue('Generated text');
  mocks.generateReplyVariants.mockReset().mockResolvedValue({
    hasBrandVoice: true,
    isReplayed: false,
    maxCharacters: 280,
    platform: 'twitter',
    tone: 'agree',
    variants: ['First reply', 'Second reply'],
  });
  mocks.refineText.mockReset().mockResolvedValue({
    hasBrandVoice: true,
    isReplayed: false,
    maxCharacters: 280,
    mode: 'rewrite',
    platform: 'twitter',
    text: 'Edited text',
  });
  mocks.execute.mockReset().mockResolvedValue({
    success: true,
    data: { id: 'image-id', url: 'https://cdn.example/image.png' },
  });
  mocks.fetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { id: 'resource-id' } }),
  });
});

async function dispatch(request: Record<string, unknown>) {
  const payload = request.payload as Record<string, unknown> | undefined;
  if (typeof request.brandId === 'string')
    mocks.workspaceBrand = request.brandId;
  else if (typeof payload?.brandId === 'string')
    mocks.workspaceBrand = payload.brandId;
  const respond = vi.fn();
  expect(backgroundListener(request, {}, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenCalled());
  return respond.mock.calls[0][0];
}

describe('background user action routing', () => {
  it('routes autoModel to text generation once', async () => {
    const response = await dispatch({
      event: 'autoModel',
      postContent: 'Original',
      content: 'Original',
    });
    expect(response.success).toBe(true);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('no longer answers the removed improvePost event', () => {
    const respond = vi.fn();
    expect(
      backgroundListener(
        { event: 'improvePost', postContent: 'Original' },
        {},
        respond,
      ),
    ).toBeUndefined();
    expect(respond).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it.each(['proofread', 'rewrite'])(
    'routes the %s text action to the catalog once with the request key',
    async (mode) => {
      const request = {
        event: 'refineText',
        mode,
        platform: 'twitter',
        requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
        text: 'Original draft',
      };
      const response = await dispatch(request);
      expect(response).toEqual({
        result: expect.objectContaining({ text: 'Edited text' }),
        success: true,
      });
      expect(mocks.refineText).toHaveBeenCalledExactlyOnceWith({
        mode,
        platform: 'twitter',
        requestKey: request.requestKey,
        text: 'Original draft',
      });
      expect(mocks.generateText).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['an unknown mode', { mode: 'summarize' }],
    ['a blank draft', { text: '  ' }],
    ['a missing request key', { requestKey: undefined }],
  ])('rejects %s before any request', async (_label, patch) => {
    const response = await dispatch({
      event: 'refineText',
      mode: 'rewrite',
      platform: 'twitter',
      requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
      text: 'Draft',
      ...patch,
    });
    expect(response).toEqual({
      error: 'Select the text to edit first.',
      success: false,
    });
    expect(mocks.refineText).not.toHaveBeenCalled();
  });

  it('requires a signed-in user for a text action', async () => {
    mocks.getToken.mockResolvedValue(null);
    const response = await dispatch({
      event: 'refineText',
      mode: 'rewrite',
      platform: 'twitter',
      requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
      text: 'Draft',
    });
    expect(response).toEqual({ error: 'Not authenticated', success: false });
    expect(mocks.refineText).not.toHaveBeenCalled();
  });

  describe('reply options', () => {
    const requestKey = '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c';
    const request = {
      event: 'generateReplyVariants',
      platform: 'reddit',
      postAuthor: 'u/ada',
      postContent: 'We just launched.',
      requestKey,
      tone: 'challenge',
      variants: 4,
    };

    it('routes the request to the catalog action once, with the source post and tone', async () => {
      const response = await dispatch(request);

      expect(response).toEqual({
        result: expect.objectContaining({
          variants: ['First reply', 'Second reply'],
        }),
        success: true,
      });
      expect(mocks.generateReplyVariants).toHaveBeenCalledExactlyOnceWith({
        platform: 'reddit',
        postAuthor: 'u/ada',
        postContent: 'We just launched.',
        requestKey,
        tone: 'challenge',
        variants: 4,
      });
      expect(mocks.generateText).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it.each([
      ['a blank post', { postContent: ' ' }],
      ['an unknown tone', { tone: 'friendly' }],
      ['a missing tone', { tone: undefined }],
      ['a missing platform', { platform: undefined }],
      ['a missing request key', { requestKey: undefined }],
    ])('rejects %s before any request', async (_label, patch) => {
      const response = await dispatch({ ...request, ...patch });

      expect(response).toEqual({
        error: 'Open a post to reply to first.',
        success: false,
      });
      expect(mocks.generateReplyVariants).not.toHaveBeenCalled();
    });

    it('requires a signed-in user', async () => {
      mocks.getToken.mockResolvedValue(null);

      expect(await dispatch(request)).toEqual({
        error: 'Not authenticated',
        success: false,
      });
      expect(mocks.generateReplyVariants).not.toHaveBeenCalled();
    });

    it('answers the single-click reply button with one add-value reply and a fresh key', async () => {
      mocks.generateReplyVariants.mockResolvedValue({
        hasBrandVoice: true,
        variants: ['Only reply'],
      });

      const response = await dispatch({
        event: 'generateReply',
        platform: 'twitter',
        postAuthor: '@ada',
        postContent: 'We just launched.',
        postId: '1',
        url: 'https://x.com/ada/status/1',
      });

      expect(response).toEqual({
        reply: 'Only reply',
        success: true,
        variants: ['Only reply'],
      });
      expect(mocks.generateReplyVariants).toHaveBeenCalledExactlyOnceWith({
        platform: 'twitter',
        postAuthor: '@ada',
        postContent: 'We just launched.',
        requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        tone: 'add-value',
        variants: 1,
      });
    });

    it.each([
      ['generateReplyWithMedia', { mediaType: 'image' }],
      ['generateReplyWithVideo', { duration: 5 }],
    ])(
      'writes the reply text of %s through the same action, never /prompts/tweet',
      async (event, extra) => {
        mocks.generateReplyVariants.mockResolvedValue({
          hasBrandVoice: true,
          variants: ['Reply text'],
        });
        mocks.fetch.mockResolvedValue({
          ok: false,
          json: async () => ({}),
        });

        await dispatch({
          event,
          platform: 'twitter',
          postAuthor: '@ada',
          postContent: 'We just launched.',
          postId: '1',
          url: 'https://x.com/ada/status/1',
          ...extra,
        });

        expect(mocks.generateReplyVariants).toHaveBeenCalledExactlyOnceWith({
          platform: 'twitter',
          postAuthor: '@ada',
          postContent: 'We just launched.',
          requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
          tone: 'add-value',
          variants: 1,
        });
        const requested = mocks.fetch.mock.calls.map((call) => String(call[0]));
        expect(requested.some((url) => url.includes('prompts/tweet'))).toBe(
          false,
        );
      },
    );
  });

  it.each(['generatePostImage', 'generateImage'])(
    'routes %s to the typed image generate action',
    async (event) => {
      await dispatch({ event, postContent: 'Artwork', prompt: 'Artwork' });
      expect(mocks.execute).toHaveBeenCalledExactlyOnceWith('image', {
        type: 'image',
        prompt: 'Artwork',
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it('surfaces generation errors without retrying a dead endpoint', async () => {
    mocks.refineText.mockRejectedValue(new Error('Insufficient credits'));
    expect(
      await dispatch({
        event: 'refineText',
        mode: 'rewrite',
        platform: 'twitter',
        requestKey: '6f1c1b1e-1a0b-4e0f-9a3e-0c3d2f4b5a6c',
        text: 'Original',
      }),
    ).toEqual({ success: false, error: 'Insufficient credits' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  const xCapture = {
    author: 'Author',
    authorHandle: 'author',
    canonicalUrl: 'https://x.com/author/status/123',
    externalIdentity: '123',
    host: 'x',
    isSelection: false,
    media: [],
    scope: 'page',
    text: 'Original post',
    title: 'Original post',
    typeHints: [],
    url: 'https://x.com/author/status/123',
  };

  function sourceResource(deduplicated: boolean) {
    return {
      data: {
        id: 'csource00000001',
        type: 'imported-source',
        attributes: {
          brandId: 'cbrand000000001',
          createdAt: '2026-10-12T00:00:00.000Z',
          deduplicated,
          identityDigest: 'a'.repeat(64),
          recordVersion: 1,
          snapshot: {
            authorDisplayName: 'Author',
            authorHandle: 'author',
            canonicalUrl: 'https://x.com/author/status/123',
            capturedAt: '2026-10-12T00:00:00.000Z',
            capturedText: 'Original post',
            captureSurface: 'extension',
            contentBasis: 'visible_page',
            evidenceAuthority: 'client_reported',
            externalIdentity: '123',
            host: 'x.com',
            kind: 'social',
            provenance: 'imported',
            title: 'Original post',
          },
          updatedAt: '2026-10-12T00:00:00.000Z',
        },
      },
    };
  }

  it('saves a post as an Imported source for the selected brand without generation or Knowledge', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sourceResource(false),
    });
    const result = await dispatch({
      brandId: 'cbrand000000001',
      event: 'importedSourceSave',
      raw: xCapture,
    });
    expect(result).toMatchObject({
      data: { deduplicated: false, source: { id: 'csource00000001' } },
      success: true,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe(
      'https://api.genfeed.ai/v1/brands/cbrand000000001/imported-sources',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).snapshot).toMatchObject({
      authorHandle: 'author',
      canonicalUrl: 'https://x.com/author/status/123',
      contentBasis: 'visible_page',
      externalIdentity: '123',
      kind: 'social',
    });
    const requestedUrls = mocks.fetch.mock.calls.map((call) => String(call[0]));
    for (const legacy of [
      'knowledge-sources',
      'social-sources',
      'source-posts',
      '/videos',
    ]) {
      expect(requestedUrls.some((item) => item.includes(legacy))).toBe(false);
    }
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('opens the panel for a save started on the page and reports an existing source honestly', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sourceResource(true),
    });
    const respond = vi.fn();
    expect(
      backgroundListener(
        {
          brandId: 'brand-1',
          event: 'importedSourceSave',
          raw: xCapture,
        },
        { tab: { id: 7 } },
        respond,
      ),
    ).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(respond.mock.calls[0][0]).toMatchObject({
      data: { deduplicated: true },
      success: true,
    });
    expect(mocks.openPanel).toHaveBeenCalledWith({ tabId: 7 });
  });

  it('does not save a malformed capture', async () => {
    const result = await dispatch({
      brandId: 'brand-1',
      event: 'importedSourceSave',
      raw: { text: 'No URL', title: 'Broken' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Capture a page/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('asks for a brand instead of saving into another brand', async () => {
    mocks.workspaceBrand = null;
    const result = await dispatch({
      event: 'importedSourceSave',
      raw: xCapture,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Select a brand/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('offers the explicit recapture of a deleted source instead of recreating it', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        code: 'IMPORTED_SOURCE_DELETED',
        deletedIngredientId: 'cdeleted0000001',
        message: 'Source was deleted. Use its explicit recapture route.',
      }),
    });
    const result = await dispatch({
      brandId: 'brand-1',
      event: 'importedSourceSave',
      raw: xCapture,
    });
    expect(result).toMatchObject({
      code: 'IMPORTED_SOURCE_DELETED',
      deletedSourceId: 'cdeleted0000001',
      success: false,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('captures the active tab on request and returns it for review, saving nothing', async () => {
    vi.mocked(chrome.scripting.executeScript).mockResolvedValueOnce([
      { frameId: 0, result: xCapture },
    ]);
    const result = await dispatch({
      capture: {
        pageUrl: 'https://x.com/author/status/123',
        scope: 'page',
      },
      event: 'importedSourceCapture',
    });
    expect(result).toMatchObject({ data: { host: 'x' }, success: true });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [expect.objectContaining({ scope: 'page' })],
        target: { tabId: 1 },
      }),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('refuses to capture a different page than the one the user chose', async () => {
    vi.mocked(chrome.scripting.executeScript).mockClear();
    const result = await dispatch({
      capture: { pageUrl: 'https://x.com/other/status/9', scope: 'page' },
      event: 'importedSourceCapture',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/active page changed/);
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('says so when the page does not allow capture', async () => {
    vi.mocked(chrome.scripting.executeScript).mockResolvedValueOnce([
      { frameId: 0, result: undefined },
    ]);
    const result = await dispatch({
      capture: { scope: 'page' },
      event: 'importedSourceCapture',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not allow capture/);
  });

  it('opens a source review for a right-clicked image without saving it', async () => {
    expect(mocks.contextMenuListener).toBeTypeOf('function');
    mocks.contextMenuListener?.(
      {
        editable: false,
        mediaType: 'image',
        menuItemId: 'genfeed-source',
        pageUrl: 'https://blog.example.com/a',
        srcUrl: 'https://cdn.example.com/photo.jpg',
      },
      { id: 5, url: 'https://blog.example.com/a' } as chrome.tabs.Tab,
    );
    await vi.waitFor(() =>
      expect(mocks.openPanel).toHaveBeenCalledWith({ tabId: 5 }),
    );
    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        payload: expect.objectContaining({
          sourceCapture: {
            mediaKind: 'image',
            pageUrl: 'https://blog.example.com/a',
            scope: 'media',
            targetUrl: 'https://cdn.example.com/photo.jpg',
          },
          type: 'SOURCE',
        }),
        type: 'OPEN_MODE',
      }),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('routes legacy bookmark capture into the same review flow', async () => {
    const result = await dispatch({
      event: 'saveBookmark',
      data: {
        brandId: 'brand-1',
        content: 'A passage',
        url: 'https://x.com/author/status/456',
      },
    });
    expect(result.success).toBe(true);
    expect(mocks.openPanel).toHaveBeenCalledWith({ tabId: 1 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not capture a different active page under the original source URL', async () => {
    vi.mocked(chrome.tabs.query).mockResolvedValueOnce([
      {
        id: 2,
        groupId: -1,
        discarded: false,
        autoDiscardable: true,
        url: 'https://private.example/account',
        active: true,
        index: 0,
        pinned: false,
        highlighted: true,
        incognito: false,
        selected: true,
        windowId: 1,
      },
    ]);
    const result = await dispatch({
      event: 'captureSnapshot',
      mode: 'page',
      url: 'https://x.com/author/status/123',
    });
    expect(result).toEqual({
      success: false,
      error:
        'The active page changed. Return to the source page or save its link.',
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('sends a turn and maps the assistant response rather than echoing a saved user message', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ executionId: 'run-id', status: 'queued' }),
    });
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          runId: 'old-run',
          sequence: 1,
          type: 'assistant.finalized',
          payload: { content: 'Old answer' },
        },
        {
          runId: 'run-id',
          sequence: 2,
          type: 'assistant.finalized',
          payload: { content: 'Assistant answer', metadata: {} },
        },
      ],
    });
    const response = await dispatch({
      event: 'chatSendMessage',
      payload: { threadId: 'thread', content: 'Hello', brandId: 'brand' },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/agent\/threads\/thread\/turns$/),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"clientRequestId"'),
      }),
    );
    expect(response.message.content).toBe('Assistant answer');
  });
});

describe('Library references in agent turns', () => {
  it('forwards scoped references to the real turn endpoint', async () => {
    const reference = {
      kind: 'ingredient',
      serializer: 'ingredient',
      recordId: 'image-1',
      organizationId: 'org-1',
      brandId: 'brand-1',
    };
    mocks.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ executionId: 'run-1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            runId: 'run-1',
            sequence: 1,
            type: 'assistant.finalized',
            payload: { content: 'Done' },
          },
        ],
      });
    const response = await dispatch({
      event: 'chatSendMessage',
      payload: {
        threadId: 'thread-1',
        brandId: 'brand-1',
        content: 'Use this artwork',
        artifactReferences: [reference],
      },
    });
    expect(response.success).toBe(true);
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      brandId: 'brand-1',
      artifactReferences: [reference],
      content: 'Use this artwork',
    });
  });
});

// Unit boundary: identity/bootstrap reconciliation is covered by workspace.service.test.ts.
vi.mock('~services/workspace.service', async () => {
  const { authService } = await import('~services/auth.service');
  const { apiEndpoint } = await import('~services/environment.service');
  const snapshot = async () => {
    const context =
      'getAuthContext' in authService
        ? await authService.getAuthContext()
        : null;
    return {
      userId: context?.user?.id ?? 'user-1',
      organizationId: context?.organization?.id ?? 'org-1',
      brandId: mocks.workspaceBrand,
      brands: [{ id: 'brand-1' }],
      revision: 1,
    };
  };
  return {
    requireWorkspace: snapshot,
    assertWorkspace: vi.fn(),
    loadWorkspace: snapshot,
    scopedWorkspaceRequest: async (
      path: string,
      options: RequestInit,
      expected: { organizationId: string },
    ) => {
      const token = await authService.getToken();
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('x-genfeed-organization-id', expected.organizationId);
      return fetch(path.startsWith('http') ? path : `${apiEndpoint}${path}`, {
        ...options,
        headers,
      });
    },
  };
});

it('routes publication capture only once through the strict handler with the actual sender', async () => {
  const respond = vi.fn();
  const sender = {
    id: 'test',
    tab: { id: 1 },
    frameId: 0,
    url: 'https://x.com/home',
  };
  const request = { event: 'publicationCaptureContext' };
  expect(backgroundListener(request, sender, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenCalled());
  expect(mocks.publication).toHaveBeenCalledWith(request, sender);
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.generateText).not.toHaveBeenCalled();
});

it.each([
  'publicationCaptureReplyIntent',
  'publicationCaptureReplyIntentCancel',
])(
  'routes %s through the existing asynchronous capture delegate',
  async (event) => {
    const request = { event };
    const sender = { id: 'ext', frameId: 0, url: 'https://x.com/compose/post' };
    const respond = vi.fn();
    expect(backgroundListener(request, sender, respond)).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(mocks.publication).toHaveBeenCalledWith(request, sender);
    expect(mocks.execute).not.toHaveBeenCalled();
  },
);
