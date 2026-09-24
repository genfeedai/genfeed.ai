import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  generateText: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  addListener: vi.fn(),
  openPanel: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('~services/auth.service', () => ({
  authService: { getToken: mocks.getToken },
}));
vi.mock('~services/error-tracking.service', () => ({
  initializeErrorTracking: vi.fn(),
}));
vi.mock('~services/agent-tools.service', () => ({
  AgentToolsService: class {
    execute = mocks.execute;
    generateText = mocks.generateText;
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
    contextMenus: { onClicked: { addListener: vi.fn() } },
    tabs: {
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
  mocks.getToken.mockResolvedValue('token');
  mocks.generateText.mockReset().mockResolvedValue('Generated text');
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
  const respond = vi.fn();
  expect(backgroundListener(request, {}, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenCalled());
  return respond.mock.calls[0][0];
}

describe('background user action routing', () => {
  it.each(['improvePost', 'autoModel'])(
    'routes %s to text generation once',
    async (event) => {
      const response = await dispatch({
        event,
        postContent: 'Original',
        content: 'Original',
      });
      expect(response.success).toBe(true);
      expect(mocks.generateText).toHaveBeenCalledTimes(1);
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['generatePostImage', 'generateImage'])(
    'routes %s to the image catalog action',
    async (event) => {
      await dispatch({ event, postContent: 'Artwork', prompt: 'Artwork' });
      expect(mocks.execute).toHaveBeenCalledExactlyOnceWith('image', {
        prompt: 'Artwork',
      });
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it('surfaces generation errors without retrying a dead endpoint', async () => {
    mocks.generateText.mockRejectedValue(new Error('Insufficient credits'));
    expect(
      await dispatch({ event: 'improvePost', postContent: 'Original' }),
    ).toEqual({ success: false, error: 'Insufficient credits' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('imports a supported post for the selected brand without generation or Knowledge', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        deduplicated: false,
        post: {
          id: 'source-post-1',
          authorDisplayName: 'Author',
          authorHandle: 'author',
          platform: 'twitter',
          sourceUrl: 'https://x.com/author/status/123',
          text: 'Original post',
          collectedAt: '2026-09-24T00:00:00.000Z',
        },
        source: { id: 'container-1', sourceType: 'post' },
      }),
    });
    const result = await dispatch({
      brandId: 'brand-a',
      event: 'savePost',
      platform: 'twitter',
      postId: '123',
      url: 'https://x.com/author/status/123',
    });
    expect(result).toMatchObject({
      deduplicated: false,
      success: true,
      post: { authorHandle: 'author', id: 'source-post-1' },
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.genfeed.ai/v1/social-sources/import-post?brandId=brand-a',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://x.com/author/status/123' }),
      }),
    );
    const requestedUrls = mocks.fetch.mock.calls.map((call) => String(call[0]));
    expect(requestedUrls.some((url) => url.includes('knowledge-sources'))).toBe(
      false,
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.openPanel).toHaveBeenCalledWith({ tabId: 1 });
  });

  it('does not import when the post URL is unsupported', async () => {
    const result = await dispatch({
      brandId: 'brand-a',
      event: 'savePost',
      url: 'https://example.com/not-a-post',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/X, Instagram, or TikTok/);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('asks for a brand instead of importing into another brand', async () => {
    const result = await dispatch({
      event: 'savePost',
      url: 'https://x.com/author/status/123',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Select a brand/);
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
