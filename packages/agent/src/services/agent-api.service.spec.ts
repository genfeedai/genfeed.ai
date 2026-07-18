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
        'http://api.test/agent/threads',
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

  describe('updateThreadContext', () => {
    it('sends the expected version for a compare-and-swap scope mutation', async () => {
      const thread = {
        brandId: 'brand-1',
        contextVersion: 4,
        id: 'c-1',
        status: 'active',
      };
      mockJsonApiResource(thread, 'thread');
      const service = makeService();

      await expect(
        Effect.runPromise(
          service.updateThreadContextEffect('c-1', {
            brandId: 'brand-1',
            expectedContextVersion: 3,
          }),
        ),
      ).resolves.toEqual(thread);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads/c-1/context',
        expect.objectContaining({
          body: JSON.stringify({
            brandId: 'brand-1',
            expectedContextVersion: 3,
          }),
          method: 'PATCH',
        }),
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
        'http://api.test/agent/threads/c-1/messages',
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
        'http://api.test/agent/threads/c-1/ui-actions',
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
        'http://api.test/agent/threads/turns',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends an existing thread turn to the thread-scoped endpoint', async () => {
      const resp = {
        message: { content: 'hi', role: 'assistant' },
        threadId: 'c-1',
      };
      mockOk(resp);
      const service = makeService();

      await Effect.runPromise(
        service.chatEffect({ content: 'hello', threadId: 'c-1' }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads/c-1/turns',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('serializes typed canonical references on a thread turn', async () => {
      mockOk({
        message: { content: 'hi', role: 'assistant' },
        threadId: 'c-1',
      });
      const service = makeService();
      const artifactReference = {
        brandId: 'brand-1',
        kind: 'ingredient' as const,
        organizationId: 'org-1',
        recordId: 'ingredient-1',
        serializer: 'ingredient' as const,
      };

      await Effect.runPromise(
        service.chatEffect({
          artifactReferences: [artifactReference],
          brandId: 'brand-1',
          content: 'Use this asset',
          threadId: 'c-1',
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads/c-1/turns',
        expect.objectContaining({
          body: JSON.stringify({
            artifactReferences: [artifactReference],
            brandId: 'brand-1',
            content: 'Use this asset',
          }),
          method: 'POST',
        }),
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
        'http://api.test/agent/threads/turns/stream',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('starts an existing thread stream through the thread-scoped endpoint', async () => {
      const resp = {
        channel: 'socket',
        runId: 'run-1',
        threadId: 'c-1',
      };
      mockOk(resp);
      const service = makeService();

      await Effect.runPromise(
        service.chatStreamEffect({ content: 'hello', threadId: 'c-1' }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads/c-1/turns/stream',
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
        expect.stringContaining('/agent/threads?page=1'),
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
        'http://api.test/agent/threads',
        expect.objectContaining({
          body: JSON.stringify({ status: 'archived' }),
          method: 'PATCH',
        }),
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
        'http://api.test/agent/threads/c-1/snapshot',
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
        'http://api.test/agent/threads/thread-1/input-requests/input-1/responses',
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

    it('includes the selected brand scope', async () => {
      const run = { id: 'run-1', status: 'cancelled' };
      mockJsonApiResource(run, 'agent-run');
      const service = makeService();

      await Effect.runPromise(
        service.cancelRunEffect('run-1', undefined, 'brand-1'),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/runs/run-1/cancellations?brand=brand-1',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('operator runs', () => {
    it('returns paginated brand-scoped run history', async () => {
      mockOk({
        data: [
          {
            attributes: { label: 'Campaign run', status: 'completed' },
            id: 'run-1',
            type: 'agent-run',
          },
        ],
        links: {
          pagination: { limit: 10, page: 2, pages: 3, total: 24 },
        },
      });
      const service = makeService();

      await expect(
        Effect.runPromise(
          service.listRunsEffect({ brandId: 'brand-1', page: 2 }),
        ),
      ).resolves.toEqual({
        pagination: { limit: 10, page: 2, pages: 3, total: 24 },
        runs: [{ id: 'run-1', label: 'Campaign run', status: 'completed' }],
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/runs?limit=10&page=2&brand=brand-1',
        expect.any(Object),
      );
    });

    it('uses explicit filters and derives empty pagination when links are absent', async () => {
      mockOk({ data: [] });
      const service = makeService();

      await expect(
        Effect.runPromise(
          service.listRunsEffect({ limit: 5, status: 'failed' }),
        ),
      ).resolves.toEqual({
        pagination: { limit: 5, page: 1, pages: 0, total: 0 },
        runs: [],
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/runs?limit=5&page=1&status=failed',
        expect.any(Object),
      );
    });

    it('preserves the requested page in fallback pagination', async () => {
      mockOk({
        data: [
          {
            attributes: { label: 'Older run', status: 'completed' },
            id: 'run-11',
            type: 'agent-run',
          },
        ],
      });
      const service = makeService();

      await expect(
        Effect.runPromise(service.listRunsEffect({ limit: 10, page: 2 })),
      ).resolves.toEqual({
        pagination: { limit: 10, page: 2, pages: 2, total: 11 },
        runs: [{ id: 'run-11', label: 'Older run', status: 'completed' }],
      });
    });

    it('omits empty optional run filters', async () => {
      mockOk({ data: [] });
      const service = makeService();

      await Effect.runPromise(
        service.listRunsEffect({ brandId: '', status: '' }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/runs?limit=10&page=1',
        expect.any(Object),
      );
    });

    it('fetches detail and retries within the selected brand', async () => {
      const run = { id: 'run-1', status: 'pending' };
      mockJsonApiResource(run, 'agent-run');
      mockJsonApiResource(run, 'agent-run');
      const service = makeService();

      await Effect.runPromise(service.getRunEffect('run-1', 'brand-1'));
      await Effect.runPromise(
        service.retryRunEffect('run-1', undefined, 'brand-1'),
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'http://api.test/runs/run-1?brand=brand-1',
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'http://api.test/runs/run-1/retries?brand=brand-1',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('mentions', () => {
    it('fetches credential mentions', async () => {
      mockOk({
        mentions: [
          {
            avatar: null,
            handle: '@genfeed',
            id: 'credential-1',
            name: 'Genfeed',
            platform: 'twitter',
          },
        ],
      });
      const service = makeService();

      const result = await Effect.runPromise(service.getMentionsEffect());

      expect(result).toEqual([
        {
          avatar: null,
          handle: '@genfeed',
          id: 'credential-1',
          name: 'Genfeed',
          platform: 'twitter',
        },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/credentials/mentions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('fetches team mentions from the API', async () => {
      mockOk({
        mentions: [
          {
            displayName: 'Ada Lovelace',
            id: 'member-1',
            isAgent: false,
            role: 'Admin',
          },
        ],
      });
      const service = makeService();

      const result = await Effect.runPromise(service.getTeamMentionsEffect());

      expect(result).toEqual([
        {
          displayName: 'Ada Lovelace',
          id: 'member-1',
          isAgent: false,
          role: 'Admin',
        },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/team/mentions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('fetches content mentions from the API', async () => {
      mockOk({
        mentions: [
          {
            contentTitle: 'Launch thread',
            contentType: 'text',
            id: 'post-1',
          },
        ],
      });
      const service = makeService();

      const result = await Effect.runPromise(
        service.getContentMentionsEffect(),
      );

      expect(result).toEqual([
        {
          contentTitle: 'Launch thread',
          contentType: 'text',
          id: 'post-1',
        },
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/content/mentions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('fails team mentions through the AgentApiError path', async () => {
      mockError(401, { message: 'Unauthorized' });
      const service = makeService();

      const error = await Effect.runPromise(
        Effect.flip(service.getTeamMentionsEffect()),
      );

      expect(error).toEqual(
        expect.objectContaining({
          _tag: 'AgentApiRequestError',
          status: 401,
        }),
      );
    });
  });
});
