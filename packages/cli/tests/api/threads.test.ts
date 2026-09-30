import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockPost = vi.fn();
const mockFlattenCollection = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  patch: (...args: unknown[]) => mockPatch(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
  flattenSingle: (...args: unknown[]) => mockFlattenSingle(...args),
}));

describe('api/threads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts stream chat with threadId as the canonical field', async () => {
    mockPost.mockResolvedValue({
      runId: 'run-1',
      startedAt: '2026-03-12T00:00:00.000Z',
      threadId: 'thread-1',
    });

    const { startAgentChatStream } = await import('../../src/api/threads');
    await startAgentChatStream({
      attachments: [{ kind: 'image', url: 'https://cdn.genfeed.ai/example.png' }],
      clientRequestId: 'request-1',
      content: 'hello',
      model: 'claude-3-7-sonnet',
      threadId: 'thread-1',
    });

    expect(mockPost).toHaveBeenCalledWith('/agent/threads/thread-1/turns/stream', {
      attachments: [{ kind: 'image', url: 'https://cdn.genfeed.ai/example.png' }],
      brandId: undefined,
      clientRequestId: 'request-1',
      content: 'hello',
      expectedContextVersion: undefined,
      hostSupportsApproval: false,
      model: 'claude-3-7-sonnet',
      source: 'agent',
    });
  });

  it('archives threads through the threads collection endpoint', async () => {
    mockPatch.mockResolvedValue({ data: { id: 'thread-1' } });
    mockFlattenSingle.mockReturnValue({ id: 'thread-1', status: 'archived' });

    const { archiveThread } = await import('../../src/api/threads');
    const result = await archiveThread('thread-1');

    expect(mockPatch).toHaveBeenCalledWith('/agent/threads/thread-1', {
      status: 'archived',
    });
    expect(result).toEqual({ id: 'thread-1', status: 'archived' });
  });

  it('starts a new stream chat without a threadId', async () => {
    mockPost.mockResolvedValue({ runId: 'run-2', threadId: 'thread-2' });

    const { startAgentChatStream } = await import('../../src/api/threads');
    await startAgentChatStream({ content: 'hello', source: 'onboarding' });

    expect(mockPost).toHaveBeenCalledWith('/agent/threads/turns/stream', {
      attachments: undefined,
      brandId: undefined,
      clientRequestId: expect.any(String),
      content: 'hello',
      expectedContextVersion: undefined,
      hostSupportsApproval: false,
      model: undefined,
      source: 'onboarding',
    });
  });

  it('lists threads without a status filter', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ contextVersion: 1, id: 'thread-1' }]);

    const { listThreads } = await import('../../src/api/threads');
    const result = await listThreads();

    expect(mockGet).toHaveBeenCalledWith('/agent/threads');
    expect(result).toEqual([{ contextVersion: 1, id: 'thread-1' }]);
  });

  it('lists threads filtered by status', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { listThreads } = await import('../../src/api/threads');
    await listThreads('active');

    expect(mockGet).toHaveBeenCalledWith('/agent/threads?status=active');
  });

  it('gets a single thread by id', async () => {
    mockGet.mockResolvedValue({ data: { id: 'thread-1' } });
    mockFlattenSingle.mockReturnValue({ contextVersion: 2, id: 'thread-1' });

    const { getThread } = await import('../../src/api/threads');
    const result = await getThread('thread-1');

    expect(mockGet).toHaveBeenCalledWith('/agent/threads/thread-1');
    expect(result.contextVersion).toBe(2);
  });

  it('gets thread messages with the default limit', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ id: 'message-1' }]);

    const { getThreadMessages } = await import('../../src/api/threads');
    const result = await getThreadMessages('thread-1');

    expect(mockGet).toHaveBeenCalledWith('/agent/threads/thread-1/messages?limit=20');
    expect(result).toEqual([{ id: 'message-1' }]);
  });

  it('updates thread context with the expected version', async () => {
    mockPatch.mockResolvedValue({ data: { id: 'thread-1' } });
    mockFlattenSingle.mockReturnValue({ brandId: 'brand-1', contextVersion: 3, id: 'thread-1' });

    const { updateThreadContext } = await import('../../src/api/threads');
    const result = await updateThreadContext('thread-1', {
      brandId: 'brand-1',
      expectedContextVersion: 2,
    });

    expect(mockPatch).toHaveBeenCalledWith('/agent/threads/thread-1/context', {
      brandId: 'brand-1',
      expectedContextVersion: 2,
    });
    expect(result.contextVersion).toBe(3);
  });

  it('gets the thread snapshot as a plain payload', async () => {
    const snapshot = { lastSequence: 4, pendingInputRequests: [], threadId: 'thread-1' };
    mockGet.mockResolvedValue(snapshot);

    const { getThreadSnapshot } = await import('../../src/api/threads');
    const result = await getThreadSnapshot('thread-1');

    expect(mockGet).toHaveBeenCalledWith('/agent/threads/thread-1/snapshot');
    expect(result).toEqual(snapshot);
    expect(mockFlattenSingle).not.toHaveBeenCalled();
  });

  it('gets thread events without afterSequence when it is zero', async () => {
    mockGet.mockResolvedValue([]);

    const { getThreadEvents } = await import('../../src/api/threads');
    await getThreadEvents('thread-1', 0);

    expect(mockGet).toHaveBeenCalledWith('/agent/threads/thread-1/events');
  });

  it('gets thread events after a positive sequence', async () => {
    mockGet.mockResolvedValue([]);

    const { getThreadEvents } = await import('../../src/api/threads');
    await getThreadEvents('thread-1', 7);

    expect(mockGet).toHaveBeenCalledWith('/agent/threads/thread-1/events?afterSequence=7');
  });

  it('forwards an abort signal while getting thread events', async () => {
    const controller = new AbortController();
    mockGet.mockResolvedValue([]);

    const { getThreadEvents } = await import('../../src/api/threads');
    await getThreadEvents('thread-1', 7, controller.signal);

    expect(mockGet).toHaveBeenCalledWith('/agent/threads/thread-1/events?afterSequence=7', {
      signal: controller.signal,
    });
  });

  it('responds to an input request with scope', async () => {
    mockPost.mockResolvedValue({ requestId: 'req-1', status: 'resolved' });

    const { respondToInputRequest } = await import('../../src/api/threads');
    const result = await respondToInputRequest('thread-1', 'req-1', 'yes', {
      brandId: null,
      expectedContextVersion: 2,
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/agent/threads/thread-1/input-requests/req-1/responses',
      { answer: 'yes', brandId: null, expectedContextVersion: 2 }
    );
    expect(result.status).toBe('resolved');
  });

  it('responds to an input request without scope', async () => {
    mockPost.mockResolvedValue({ requestId: 'req-1', status: 'resolved' });

    const { respondToInputRequest } = await import('../../src/api/threads');
    await respondToInputRequest('thread-1', 'req-1', 'no');

    expect(mockPost).toHaveBeenCalledWith(
      '/agent/threads/thread-1/input-requests/req-1/responses',
      { answer: 'no' }
    );
  });
});
