import { DiscordWorkflowExecutionClient } from '@discord/services/discord-workflow-execution.client';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

interface HttpMocks {
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
}

function createHttpMocks(): HttpMocks {
  return { get: vi.fn(), patch: vi.fn(), post: vi.fn() };
}

function createClient(
  http: HttpMocks,
  options?: { apiKey?: string; pollTimeoutMs?: number },
): DiscordWorkflowExecutionClient {
  return new DiscordWorkflowExecutionClient({
    apiKey: options?.apiKey,
    apiUrl: 'http://api.test',
    httpService: http as unknown as HttpService,
    pollIntervalMs: 1,
    pollTimeoutMs: options?.pollTimeoutMs ?? 1000,
  });
}

describe('DiscordWorkflowExecutionClient', () => {
  describe('create', () => {
    it('should post inputs and return the execution id', async () => {
      const http = createHttpMocks();
      http.post.mockReturnValue(
        of({ data: { executionId: 'exec-1', nodeResults: [] } }),
      );
      const client = createClient(http, { apiKey: 'secret' });

      const executionId = await client.create(
        'org-1',
        'wf-1',
        { prompt: 'hello' },
        { imageModel: 'flux-pro' },
      );

      expect(executionId).toBe('exec-1');
      expect(http.post).toHaveBeenCalledWith(
        'http://api.test/v1/internal/orgs/org-1/workflow-executions',
        {
          inputValues: { prompt: 'hello' },
          metadata: { imageModel: 'flux-pro' },
          workflowId: 'wf-1',
        },
        { headers: { Authorization: 'Bearer secret' } },
      );
    });

    it('should omit the Authorization header without an api key', async () => {
      const http = createHttpMocks();
      http.post.mockReturnValue(
        of({ data: { executionId: 'exec-1', nodeResults: [] } }),
      );
      const client = createClient(http);

      await client.create('org-1', 'wf-1', {});

      expect(http.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { headers: undefined },
      );
    });

    it('should throw when the response has no execution id', async () => {
      const http = createHttpMocks();
      http.post.mockReturnValue(of({ data: { nodeResults: [] } }));
      const client = createClient(http);

      await expect(client.create('org-1', 'wf-1', {})).rejects.toThrow(
        'Workflow execution did not return an execution id',
      );
    });

    it('should propagate transport errors', async () => {
      const http = createHttpMocks();
      http.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
      const client = createClient(http);

      await expect(client.create('org-1', 'wf-1', {})).rejects.toThrow(
        'ECONNREFUSED',
      );
    });
  });

  describe('get', () => {
    it('should fetch and normalize the execution snapshot', async () => {
      const http = createHttpMocks();
      http.get.mockReturnValue(
        of({
          data: {
            executionId: 'exec-1',
            nodeResults: [],
            progress: 40,
            status: 'running',
          },
        }),
      );
      const client = createClient(http, { apiKey: 'secret' });

      const execution = await client.get('org-1', 'exec-1');

      expect(execution).toEqual({
        error: undefined,
        executionId: 'exec-1',
        nodeResults: [],
        progress: 40,
        status: 'running',
      });
      expect(http.get).toHaveBeenCalledWith(
        'http://api.test/v1/internal/orgs/org-1/workflow-executions/exec-1',
        { headers: { Authorization: 'Bearer secret' } },
      );
    });
  });

  describe('cancel', () => {
    it('should patch the execution to cancelled', async () => {
      const http = createHttpMocks();
      http.patch.mockReturnValue(of({ data: {} }));
      const client = createClient(http, { apiKey: 'secret' });

      await client.cancel('org-1', 'exec-1');

      expect(http.patch).toHaveBeenCalledWith(
        'http://api.test/v1/internal/orgs/org-1/workflow-executions/exec-1',
        { status: 'cancelled' },
        { headers: { Authorization: 'Bearer secret' } },
      );
    });
  });

  describe('waitForTerminal', () => {
    it('should return immediately on a terminal status', async () => {
      const http = createHttpMocks();
      http.get.mockReturnValue(
        of({
          data: { executionId: 'exec-1', nodeResults: [], status: 'completed' },
        }),
      );
      const client = createClient(http);

      const execution = await client.waitForTerminal('org-1', 'exec-1');

      expect(execution.status).toBe('completed');
      expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('should poll until the execution reaches a terminal status', async () => {
      const http = createHttpMocks();
      http.get
        .mockReturnValueOnce(
          of({
            data: { executionId: 'exec-1', nodeResults: [], status: 'running' },
          }),
        )
        .mockReturnValueOnce(
          of({
            data: { executionId: 'exec-1', nodeResults: [], status: 'failed' },
          }),
        );
      const client = createClient(http);

      const execution = await client.waitForTerminal('org-1', 'exec-1');

      expect(execution.status).toBe('failed');
      expect(http.get).toHaveBeenCalledTimes(2);
    });

    it('should throw when polling exceeds the timeout', async () => {
      const http = createHttpMocks();
      const client = createClient(http, { pollTimeoutMs: 0 });

      await expect(client.waitForTerminal('org-1', 'exec-1')).rejects.toThrow(
        'Workflow execution polling timed out',
      );
      expect(http.get).not.toHaveBeenCalled();
    });
  });
});
