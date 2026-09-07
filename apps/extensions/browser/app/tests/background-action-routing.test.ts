import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  generateText: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
  addListener: vi.fn(),
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

beforeAll(async () => {
  vi.stubGlobal('fetch', mocks.fetch);
  Object.assign(chrome, {
    sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: mocks.addListener },
    },
    contextMenus: { onClicked: { addListener: vi.fn() } },
    tabs: { onUpdated: { addListener: vi.fn() } },
  });
  await import('../src/background');
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
  const listener = mocks.addListener.mock.calls[0][0];
  expect(listener(request, {}, respond)).toBe(true);
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

  it('captures saved posts as personal Knowledge through the canonical ingestion path', async () => {
    await dispatch({
      event: 'savePost',
      platform: 'twitter',
      postId: 'post-id',
      url: 'https://x.com/author/status/123',
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/knowledge-sources$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          kind: 'URL',
          provenance: {
            category: 'TWEET',
            platform: 'TWITTER',
            capturedBy: 'extension',
            postId: 'post-id',
          },
          purpose: 'INSPIRATION',
          referenceUrl: 'https://x.com/author/status/123',
          scope: 'personal',
          title: 'twitter · x.com',
        }),
      }),
    );
  });

  it('scopes a bookmark capture to the selected brand and keeps the captured text', async () => {
    await dispatch({
      data: {
        brandId: 'brand-1',
        content: 'Hook worth stealing',
        intent: 'reply',
        platform: 'twitter',
        title: 'Great thread',
        url: 'https://x.com/author/status/456',
      },
      event: 'saveBookmark',
    });
    const [path, init] = mocks.fetch.mock.calls.at(-1) as [string, RequestInit];
    expect(path).toMatch(/\/knowledge-sources\?brandId=brand-1$/);
    expect(JSON.parse(String(init.body))).toMatchObject({
      kind: 'URL',
      purpose: 'RESEARCH',
      referenceUrl: 'https://x.com/author/status/456',
      scope: 'brand',
      text: 'Hook worth stealing',
      title: 'Great thread',
    });
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
