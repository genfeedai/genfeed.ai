import {
  mockError,
  mockFetch,
  mockJsonApiCollection,
  mockJsonApiResource,
  mockOk,
} from '@agent-tests/json-api-fetch.mock';
import { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type { AgentApiDecodeError } from '@genfeedai/agent/services/agent-api-error';
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

  describe('getActiveWorkflowExecutions', () => {
    it('restores the known execution directly and verifies its thread', async () => {
      mockJsonApiResource(
        { id: 'older', status: 'RUNNING', metadata: { threadId: 'thread-1' } },
        'workflow-execution',
      );
      const results = await makeService().getActiveWorkflowExecutions(
        undefined,
        { threadId: 'thread-1', executionId: 'older' },
      );
      expect(results).toEqual([expect.objectContaining({ id: 'older' })]);
      expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
        'http://api.test/workflow-executions/older',
        expect.any(Object),
      );
    });

    it('does not restore a known execution from a different thread', async () => {
      mockJsonApiResource(
        {
          id: 'other',
          status: 'RUNNING',
          metadata: { threadId: 'thread-other' },
        },
        'workflow-execution',
      );
      mockJsonApiCollection([], 'workflow-execution');
      mockJsonApiCollection([], 'workflow-execution');
      await expect(
        makeService().getActiveWorkflowExecutions(undefined, {
          threadId: 'thread-1',
          executionId: 'other',
        }),
      ).resolves.toEqual([]);
    });

    it('finds a newer run in the same thread when the saved run no longer exists', async () => {
      mockError(404);
      mockJsonApiCollection(
        [
          {
            id: 'other',
            status: 'PENDING',
            metadata: { threadId: 'thread-other' },
          },
          { id: 'new', status: 'PENDING', metadata: { threadId: 'thread-1' } },
        ],
        'workflow-execution',
      );
      mockJsonApiCollection([], 'workflow-execution');
      const results = await makeService().getActiveWorkflowExecutions(
        undefined,
        { threadId: 'thread-1', executionId: 'missing' },
      );
      expect(results.map((execution) => execution.id)).toEqual(['new']);
    });

    it('rejects failed recovery instead of reporting the thread has no active run', async () => {
      mockError(500);
      await expect(
        makeService().getActiveWorkflowExecutions(undefined, {
          threadId: 'thread-1',
          executionId: 'older',
        }),
      ).rejects.toThrow('500');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('pages active statuses independently of completed history', async () => {
      mockFetch.mockImplementation(async (input: string) => {
        const url = new URL(input);
        const status = url.searchParams.get('status');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const items =
          status === 'PENDING'
            ? [{ id: 'pending', status }]
            : status === 'RUNNING'
              ? offset === 0
                ? Array.from({ length: 100 }, (_, i) => ({
                    id: `running-${i}`,
                    status,
                  }))
                : [{ id: 'older-running', status }]
              : [{ id: 'completed', status: 'COMPLETED' }];
        return {
          ok: true,
          json: async () => ({
            data: items.map((item) => ({
              id: item.id,
              type: 'workflow-execution',
              attributes: item,
            })),
          }),
        };
      });
      const results = await makeService().getActiveWorkflowExecutions();
      expect(results).toHaveLength(102);
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'older-running' }),
          expect.objectContaining({ id: 'pending' }),
        ]),
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('createThread', () => {
    it('creates thread', async () => {
      const conv = { id: 'c-1', status: 'active' };
      mockJsonApiResource(conv, 'thread');
      const service = makeService();
      const result = await service.createThread({ title: 'Test' });
      expect(result).toEqual(conv);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on error', async () => {
      mockError(500);
      const service = makeService();
      await expect(service.createThread({})).rejects.toThrow('500');
    });

    it('maps invalid thread documents to a typed decode error', async () => {
      mockOk({});
      const service = makeService();

      await expect(service.createThread({ title: 'Broken' })).rejects.toEqual(
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
        service.updateThreadContext('c-1', {
          brandId: 'brand-1',
          expectedContextVersion: 3,
        }),
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
      const result = await service.sendMessage({
        content: 'hi',
        threadId: 'c-1',
      });
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
        service.sendMessage({ content: 'hi', threadId: 'c-1' }),
      ).rejects.toThrow('400');
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
      const result = await service.respondToUiAction(
        'c-1',
        'confirm_install_official_workflow',
        { sourceId: 'template-1' },
      );

      expect(result).toEqual(resp);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads/c-1/ui-actions',
        expect.objectContaining({ method: 'POST' }),
      );
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
      const result = await service.chat({ content: 'hello' });
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

      await service.chat({ content: 'hello', threadId: 'c-1' });

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

      await service.chat({
        artifactReferences: [artifactReference],
        brandId: 'brand-1',
        content: 'Use this asset',
        threadId: 'c-1',
      });

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
      await expect(service.chat({ content: 'hi' })).rejects.toThrow('500');
    });
  });

  describe('chatStream', () => {
    it('starts a chat stream', async () => {
      const resp = {
        channel: 'socket',
        runId: 'run-1',
        threadId: 'c-1',
      };
      mockOk(resp);
      const service = makeService();

      const result = await service.chatStream({ content: 'hello' });

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

      await service.chatStream({ content: 'hello', threadId: 'c-1' });

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
      const result = await service.getThreads({ limit: 10, page: 1 });
      expect(result).toEqual([{ id: 'c-1' }]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agent/threads?page=1'),
        expect.anything(),
      );
    });

    it('works without params', async () => {
      mockJsonApiCollection([], 'thread');
      const service = makeService();
      await service.getThreads();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('throws on error', async () => {
      mockError(401);
      const service = makeService();
      await expect(service.getThreads()).rejects.toThrow('401');
    });

    it('includes backend error detail in thrown message', async () => {
      mockError(400, { detail: 'Invalid userId' });
      const service = makeService();
      await expect(service.getThreads()).rejects.toThrow(
        'Failed to fetch threads: 400 - Invalid userId',
      );
    });
  });

  describe('archiveAllThreads', () => {
    it('archives all active threads', async () => {
      mockOk({ archivedCount: 7 });
      const service = makeService();

      await expect(service.archiveAllThreads()).resolves.toEqual({
        archivedCount: 7,
      });

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
      const result = await service.getMessages('c-1', {
        cursor: 'older-cursor',
      });
      expect(result).toEqual([{ id: 'm-1', metadata: {}, threadId: 'c-1' }]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('c-1/messages?cursor=older-cursor'),
        expect.anything(),
      );
    });

    it('returns cursor metadata with the mapped message page', async () => {
      mockOk({
        data: [
          {
            attributes: { content: 'Older message', id: 'm-1' },
            id: 'm-1',
            type: 'thread-message',
          },
        ],
        links: {
          cursor: {
            hasMore: true,
            limit: 50,
            nextCursor: 'next-opaque-cursor',
          },
        },
      });
      const service = makeService();

      const result = await service.getMessagesPage('c-1', { limit: 50 });

      expect(result).toEqual({
        hasMore: true,
        messages: [
          {
            content: 'Older message',
            id: 'm-1',
            metadata: {},
            threadId: 'c-1',
          },
        ],
        nextCursor: 'next-opaque-cursor',
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('c-1/messages?limit=50'),
        expect.anything(),
      );
    });

    it('throws on error', async () => {
      mockError(404);
      const service = makeService();
      await expect(service.getMessages('c-1')).rejects.toThrow('404');
    });
  });

  describe('getThreadSnapshot', () => {
    it('fetches the thread snapshot', async () => {
      const snapshot = {
        activeRun: null,
        latestProposedPlan: null,
      };
      mockOk(snapshot);
      const service = makeService();

      const result = await service.getThreadSnapshot('c-1');

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

      await expect(service.getModels()).resolves.toEqual([
        {
          category: 'image',
          id: 'model-1',
          isActive: true,
          key: 'replicate/google-nano-banana',
          label: 'Nano Banana',
        },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/models?isActive=true&limit=100',
        expect.anything(),
      );
    });
  });

  describe('headers', () => {
    it('includes auth token when available', async () => {
      mockJsonApiCollection([], 'thread');
      const service = makeService('my-token');
      await service.getThreads();
      const call = mockFetch.mock.calls[0];
      const headers = await call[1].headers;
      expect(headers.Authorization).toBe('Bearer my-token');
    });

    it('omits auth when no token', async () => {
      mockJsonApiCollection([], 'thread');
      const service = makeService(null);
      await service.getThreads();
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
        service.respondToInputRequest('thread-1', 'input-1', 'Use hybrid'),
      ).resolves.toEqual(payload);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/agent/threads/thread-1/input-requests/input-1/responses',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('workflow executions', () => {
    it('fetches a single execution by id', async () => {
      const execution = { id: 'execution-1', status: 'RUNNING' };
      mockJsonApiResource(execution, 'workflow-execution');
      const service = makeService();

      await expect(
        service.getWorkflowExecution('execution-1'),
      ).resolves.toEqual(execution);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/workflow-executions/execution-1',
        expect.any(Object),
      );
    });

    it('patches the execution with the canonical cancelled status', async () => {
      const execution = { id: 'execution-1', status: 'CANCELLED' };
      mockJsonApiResource(execution, 'workflow-execution');
      const service = makeService();

      await expect(
        service.cancelWorkflowExecution('execution-1'),
      ).resolves.toEqual(execution);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/workflow-executions/execution-1',
        expect.objectContaining({
          body: JSON.stringify({ status: 'CANCELLED' }),
          method: 'PATCH',
        }),
      );
    });

    it('keeps only pending and running executions as active', async () => {
      mockJsonApiCollection(
        [
          { id: 'execution-1', status: 'PENDING' },
          { id: 'execution-2', status: 'RUNNING' },
          { id: 'execution-3', status: 'COMPLETED' },
          { id: 'execution-4', status: 'FAILED' },
        ],
        'workflow-execution',
      );
      const service = makeService();

      mockJsonApiCollection([], 'workflow-execution');
      const active = await service.getActiveWorkflowExecutions();

      expect(active.map((execution) => execution.id)).toEqual([
        'execution-1',
        'execution-2',
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.test/workflow-executions?limit=100&offset=0&status=PENDING',
        expect.any(Object),
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

      const result = await service.getMentions();

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

      const result = await service.getTeamMentions();

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

      const result = await service.getContentMentions();

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

      await expect(service.getTeamMentions()).rejects.toEqual(
        expect.objectContaining({
          _tag: 'AgentApiRequestError',
          status: 401,
        }),
      );
    });

    // A 200 whose body is any other JSON shape (a JSON:API document, an error
    // envelope) used to succeed with `mentions: undefined` and crash the
    // composer's ContentLibraryPicker at render — blanking /automation/*.
    it('maps a credential mentions payload without a mentions array to a typed decode error', async () => {
      mockOk({ data: [] });
      const service = makeService();

      await expect(service.getMentions()).rejects.toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to decode credential mentions',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });

    it('maps a team mentions payload without a mentions array to a typed decode error', async () => {
      mockOk({ data: [] });
      const service = makeService();

      await expect(service.getTeamMentions()).rejects.toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to decode team mentions',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });

    it('maps a content mentions payload without a mentions array to a typed decode error', async () => {
      mockOk({ data: [] });
      const service = makeService();

      await expect(service.getContentMentions()).rejects.toEqual(
        expect.objectContaining({
          _tag: 'AgentApiDecodeError',
          message: 'Failed to decode content mentions',
        } satisfies Partial<AgentApiDecodeError>),
      );
    });
  });
});
