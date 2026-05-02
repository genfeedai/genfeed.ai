import {
  mockError,
  mockFetch,
  mockJsonApiCollection,
  mockJsonApiResource,
  mockOk,
} from '@agent-tests/json-api-fetch.mock';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeService(token: string | null = 'test-token') {
  return new AgentApiService({
    baseUrl: 'http://api.test',
    getToken: vi.fn().mockResolvedValue(token),
  });
}

describe('AgentApiService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('createThread', () => {
    it('creates thread', async () => {
      const conv = { id: 'c-1', status: 'active' };
      mockJsonApiResource(conv, 'thread');
      const service = makeService();
      const result = await Effect.runPromise(
        service.createThreadEffect({ title: 'Test' }),
      );
      expect(result).toEqual(conv);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/threads',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(
        Effect.runPromise(service.createThreadEffect({})),
      ).rejects.toThrow('500');
    });

    it('supports an Effect-native createThread flow', async () => {
      const conv = { id: 'c-1', status: 'active' };
      mockJsonApiResource(conv, 'thread');
      const service = makeService();

      const result = await Effect.runPromise(
        service.createThreadEffect({ title: 'Test' }),
      );

      expect(result).toEqual(conv);
    });

    it('maps invalid thread documents to a typed decode error', async () => {
      mockOk({});
      const service = makeService();

      const error = await Effect.runPromise(
        Effect.flip(service.createThreadEffect({ title: 'Broken' })),
      );

      expect(error).toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to deserialize thread',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });
  });

  describe('sendMessage', () => {
    it('sends message', async () => {
      const msg = { content: 'hi', id: 'm-1', role: 'user' };
      mockJsonApiResource(msg, 'thread-message');
      const service = makeService();
      const result = await Effect.runPromise(
        service.sendMessageEffect({
          content: 'hi',
          threadId: 'c-1',
        }),
      );
      expect(result).toEqual({ ...msg, threadId: 'c-1' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/threads/c-1/messages',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(400);
      const service = makeService();
      await expect(
        Effect.runPromise(
          service.sendMessageEffect({ content: 'hi', threadId: 'c-1' }),
        ),
      ).rejects.toThrow('400');
    });

    it('supports an Effect-native sendMessage flow', async () => {
      const msg = { content: 'hi', id: 'm-1', role: 'user' };
      mockJsonApiResource(msg, 'thread-message');
      const service = makeService();

      const result = await Effect.runPromise(
        service.sendMessageEffect({
          content: 'hi',
          threadId: 'c-1',
        }),
      );

      expect(result).toEqual({ ...msg, threadId: 'c-1' });
    });
  });

  describe('respondToUiAction', () => {
    it('posts thread UI actions', async () => {
      const resp = {
        creditsRemaining: 50,
        creditsUsed: 0,
        message: {
          content: 'Official workflow installed.',
          metadata: {},
          role: 'assistant',
        },
        threadId: 'c-1',
        toolCalls: [],
      };
      mockOk(resp);
      const service = makeService();
      const result = await Effect.runPromise(
        service.respondToUiActionEffect(
          'c-1',
          'confirm_install_official_workflow',
          { sourceId: 'template-1' },
        ),
      );

      expect(result).toEqual(resp);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/threads/c-1/ui-actions',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('supports an Effect-native UI action flow', async () => {
      const resp = {
        creditsRemaining: 50,
        creditsUsed: 0,
        message: {
          content: 'Official workflow installed.',
          metadata: {},
          role: 'assistant',
        },
        threadId: 'c-1',
        toolCalls: [],
      };
      mockOk(resp);
      const service = makeService();

      const result = await Effect.runPromise(
        service.respondToUiActionEffect(
          'c-1',
          'confirm_install_official_workflow',
          { sourceId: 'template-1' },
        ),
      );

      expect(result).toEqual(resp);
    });
  });

  describe('chat', () => {
    it('sends chat', async () => {
      const resp = {
        message: { content: 'hi', role: 'assistant' },
        threadId: 'c-1',
      };
      mockOk(resp);
      const service = makeService();
      const result = await Effect.runPromise(
        service.chatEffect({ content: 'hello' }),
      );
      expect(result).toEqual(resp);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/chat',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(
        Effect.runPromise(service.chatEffect({ content: 'hi' })),
      ).rejects.toThrow('500');
    });

    it('supports an Effect-native chat flow', async () => {
      const resp = {
        message: { content: 'hi', role: 'assistant' },
        threadId: 'c-1',
      };
      mockOk(resp);
      const service = makeService();

      const result = await Effect.runPromise(
        service.chatEffect({ content: 'hello' }),
      );

      expect(result).toEqual(resp);
    });
  });

  describe('chatStream', () => {
    it('supports an Effect-native chat stream flow', async () => {
      const resp = {
        channel: 'socket',
        runId: 'run-1',
        threadId: 'c-1',
      };
      mockOk(resp);
      const service = makeService();

      const result = await Effect.runPromise(
        service.chatStreamEffect({ content: 'hello' }),
      );

      expect(result).toEqual(resp);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/chat/stream',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getThreads', () => {
    it('fetches threads from JSON:API collection', async () => {
      mockJsonApiCollection([{ id: 'c-1' }], 'thread');
      const service = makeService();
      const result = await Effect.runPromise(
        service.getThreadsEffect({ limit: 10, page: 1 }),
      );
      expect(result).toEqual([{ id: 'c-1' }]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/threads?page=1'),
        expect.anything(),
      );
    });

    it('works without params', async () => {
      mockJsonApiCollection([], 'thread');
      const service = makeService();
      await Effect.runPromise(service.getThreadsEffect());
      expect(mockFetch).toHaveBeenCalled();
    });

    it('throws on error', async () => {
      mockError(401);
      const service = makeService();
      await expect(
        Effect.runPromise(service.getThreadsEffect()),
      ).rejects.toThrow('401');
    });

    it('includes backend error detail in thrown message', async () => {
      mockError(400, { detail: 'Invalid userId' });
      const service = makeService();
      await expect(
        Effect.runPromise(service.getThreadsEffect()),
      ).rejects.toThrow('Failed to fetch threads: 400 - Invalid userId');
    });

    it('supports an Effect-native getThreads flow', async () => {
      mockJsonApiCollection([{ id: 'c-1' }], 'thread');
      const service = makeService();

      const result = await Effect.runPromise(
        service.getThreadsEffect({ limit: 10, page: 1 }),
      );

      expect(result).toEqual([{ id: 'c-1' }]);
    });
  });

  describe('archiveAllThreads', () => {
    it('archives all active threads', async () => {
      mockOk({ archivedCount: 7 });
      const service = makeService();

      await expect(
        Effect.runPromise(service.archiveAllThreadsEffect()),
      ).resolves.toEqual({ archivedCount: 7 });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/threads/archive-all',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getMessages', () => {
    it('fetches messages', async () => {
      mockJsonApiCollection([{ id: 'm-1' }], 'thread-message');
      const service = makeService();
      const result = await Effect.runPromise(
        service.getMessagesEffect('c-1', { page: 1 }),
      );
      expect(result).toEqual([{ id: 'm-1', threadId: 'c-1' }]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('c-1/messages'),
        expect.anything(),
      );
    });

    it('throws on error', async () => {
      mockError(404);
      const service = makeService();
      await expect(
        Effect.runPromise(service.getMessagesEffect('c-1')),
      ).rejects.toThrow('404');
    });
  });

  describe('getThreadSnapshot', () => {
    it('supports an Effect-native snapshot flow', async () => {
      const snapshot = {
        activeRun: null,
        latestProposedPlan: null,
      };
      mockOk(snapshot);
      const service = makeService();

      const result = await Effect.runPromise(
        service.getThreadSnapshotEffect('c-1'),
      );

      expect(result).toEqual(snapshot);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/threads/c-1/snapshot',
        expect.anything(),
      );
    });
  });

  describe('getModels', () => {
    it('deserializes models from a JSON:API collection', async () => {
      mockJsonApiCollection(
        [
          {
            category: 'image',
            id: 'model-1',
            isActive: true,
            key: 'replicate/google-nano-banana',
            label: 'Nano Banana',
          },
        ],
        'model',
      );
      const service = makeService();

      await expect(
        Effect.runPromise(service.getModelsEffect()),
      ).resolves.toEqual([
        {
          category: 'image',
          id: 'model-1',
          isActive: true,
          key: 'replicate/google-nano-banana',
          label: 'Nano Banana',
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/models?isActive=true&pagination=false',
        expect.anything(),
      );
    });
  });

  describe('headers', () => {
    it('includes auth token when available', async () => {
      mockJsonApiCollection([], 'thread');
      const service = makeService('my-token');
      await Effect.runPromise(service.getThreadsEffect());
      const call = mockFetch.mock.calls[0];
      const headers = await call[1].headers;
      expect(headers.Authorization).toBe('Bearer my-token');
    });

    it('omits auth when no token', async () => {
      mockJsonApiCollection([], 'thread');
      const service = makeService(null);
      await Effect.runPromise(service.getThreadsEffect());
      const call = mockFetch.mock.calls[0];
      const headers = await call[1].headers;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('respondToInputRequest', () => {
    it('posts a thread input response', async () => {
      const payload = {
        answer: 'Use hybrid',
        requestId: 'input-1',
        resolvedAt: '2026-03-09T10:00:00.000Z',
        status: 'resolved',
        threadId: 'thread-1',
      };
      mockOk(payload);
      const service = makeService();

      await expect(
        Effect.runPromise(
          service.respondToInputRequestEffect(
            'thread-1',
            'input-1',
            'Use hybrid',
          ),
        ),
      ).resolves.toEqual(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/threads/thread-1/input-requests/input-1/responses',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('cancelRun', () => {
    it('posts a run cancellation resource', async () => {
      const run = { id: 'run-1', status: 'cancelled' };
      mockJsonApiResource(run, 'agent-run');
      const service = makeService();

      await expect(
        Effect.runPromise(service.cancelRunEffect('run-1')),
      ).resolves.toEqual(run);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/runs/run-1/cancellations',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
