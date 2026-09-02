import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { testId } from '@helpers/testing/test-id.helper';
import { Effect } from 'effect';

const CHANNEL = 'agent-chat';

// #2517 default fallbacks — must mirror DEFAULT_COALESCE_WINDOW_MS /
// DEFAULT_COALESCE_MAX_BYTES in agent-stream-publisher.service.ts, since
// mockConfigService.get() resolves to `undefined` unless a test overrides it.
const DEFAULT_COALESCE_WINDOW_MS = 50;
const DEFAULT_COALESCE_MAX_BYTES = 2048;

type PublisherDependencies = ConstructorParameters<
  typeof AgentStreamPublisherService
>;
type PublishDoneInput = Parameters<
  AgentStreamPublisherService['publishDone']
>[0];
type PublishErrorInput = Parameters<
  AgentStreamPublisherService['publishError']
>[0];
type PublishReasoningInput = Parameters<
  AgentStreamPublisherService['publishReasoning']
>[0];
type PublishStreamStartInput = Parameters<
  AgentStreamPublisherService['publishStreamStart']
>[0];
type PublishToolCompleteInput = Parameters<
  AgentStreamPublisherService['publishToolComplete']
>[0];
type PublishToolStartInput = Parameters<
  AgentStreamPublisherService['publishToolStart']
>[0];
type PublishUIBlocksInput = Parameters<
  AgentStreamPublisherService['publishUIBlocks']
>[0];

const mockRedisService = {
  publish: vi.fn(),
  publishBatch: vi.fn(),
};

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

const mockAgentThreadsService = {
  findOne: vi.fn(),
};

const mockAgentThreadEngineService = {
  appendEvent: vi.fn(),
  appendEventEffect: vi.fn(() => Effect.void),
};

const mockConfigService = {
  get: vi.fn<(key: string) => string | undefined>(),
};

describe('AgentStreamPublisherService', () => {
  let service: AgentStreamPublisherService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockConfigService.get.mockReturnValue(undefined);
    mockRedisService.publish.mockResolvedValue(undefined);
    mockRedisService.publishBatch.mockResolvedValue(undefined);
    service = new AgentStreamPublisherService(
      mockRedisService as unknown as PublisherDependencies[0],
      mockLoggerService as unknown as PublisherDependencies[1],
      mockAgentThreadsService as unknown as PublisherDependencies[2],
      mockAgentThreadEngineService as unknown as PublisherDependencies[3],
      mockConfigService as unknown as PublisherDependencies[4],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('publishStreamStart', () => {
    it('should publish to agent-chat with type agent:stream_start', async () => {
      const data = {
        organizationId: 'org-1',
        runId: 'run-1',
        sessionId: 'sess-1',
        userId: 'user-1',
      };
      await service.publishStreamStart(
        data as unknown as PublishStreamStartInput,
      );

      expect(mockRedisService.publish).toHaveBeenCalledOnce();
      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:stream_start');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishToken', () => {
    it('should not publish immediately for a token below the byte threshold', async () => {
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'hello',
        userId: 'user-1',
      });

      expect(mockRedisService.publish).not.toHaveBeenCalled();
      expect(mockRedisService.publishBatch).not.toHaveBeenCalled();
    });

    it('should coalesce multiple tokens within the window into a single publish, concatenated in order', async () => {
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'hel',
        userId: 'user-1',
      });
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'lo ',
        userId: 'user-1',
      });
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'world',
        userId: 'user-1',
      });

      expect(mockRedisService.publish).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(DEFAULT_COALESCE_WINDOW_MS);

      expect(mockRedisService.publish).toHaveBeenCalledOnce();
      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:token');
      expect(payload.data.token).toBe('hello world');
      expect(payload.data.threadId).toBe('thread-1');
      expect(payload.data.runId).toBe('run-1');
      expect(payload.data.userId).toBe('user-1');
      expect(typeof payload.data.timestamp).toBe('string');
    });

    it('should use the coalesce window from ConfigService when provided', async () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'AGENT_STREAM_COALESCE_WINDOW_MS' ? '25' : undefined,
      );

      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'hi',
        userId: 'user-1',
      });

      await vi.advanceTimersByTimeAsync(24);
      expect(mockRedisService.publish).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(mockRedisService.publish).toHaveBeenCalledOnce();
    });

    it('should flush immediately once the buffered byte threshold is reached, without waiting for the timer', async () => {
      const largeToken = 'a'.repeat(DEFAULT_COALESCE_MAX_BYTES);

      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: largeToken,
        userId: 'user-1',
      });

      // Flushed synchronously inside publishToken's await — no timer advance needed.
      expect(mockRedisService.publish).toHaveBeenCalledOnce();
      const [, payload] = mockRedisService.publish.mock.calls[0];
      expect(payload.data.token).toBe(largeToken);
    });

    it('should use the byte threshold from ConfigService when provided', async () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'AGENT_STREAM_COALESCE_MAX_BYTES' ? '4' : undefined,
      );

      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'abcd',
        userId: 'user-1',
      });

      expect(mockRedisService.publish).toHaveBeenCalledOnce();
    });

    it('should not re-flush a buffer already cleared by the byte-threshold flush when its timer fires', async () => {
      const largeToken = 'a'.repeat(DEFAULT_COALESCE_MAX_BYTES);

      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: largeToken,
        userId: 'user-1',
      });
      expect(mockRedisService.publish).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(DEFAULT_COALESCE_WINDOW_MS);

      expect(mockRedisService.publish).toHaveBeenCalledOnce();
    });

    it('should buffer separate runs on the same thread independently', async () => {
      await service.publishToken({
        runId: 'run-a',
        threadId: 'thread-1',
        token: 'from-a',
        userId: 'user-1',
      });
      await service.publishToken({
        runId: 'run-b',
        threadId: 'thread-1',
        token: 'from-b',
        userId: 'user-1',
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_COALESCE_WINDOW_MS);

      expect(mockRedisService.publish).toHaveBeenCalledTimes(2);
      const tokens = mockRedisService.publish.mock.calls.map(
        ([, payload]) => payload.data.token,
      );
      expect(tokens).toEqual(expect.arrayContaining(['from-a', 'from-b']));
    });
  });

  describe('publishReasoning', () => {
    it('should publish with type agent:reasoning', async () => {
      const data = {
        reasoning: 'thinking...',
        runId: 'run-1',
        sessionId: 'sess-1',
      };
      await service.publishReasoning(data as unknown as PublishReasoningInput);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:reasoning');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishToolStart', () => {
    it('should publish with type agent:tool_start', async () => {
      const data = { runId: 'run-1', sessionId: 'sess-1', toolName: 'search' };
      await service.publishToolStart(data as unknown as PublishToolStartInput);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:tool_start');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });

    it('persists a thread event when the thread is valid', async () => {
      const organizationId = testId('org');
      const threadId = testId('thread');
      const userId = testId('user');

      mockAgentThreadsService.findOne.mockResolvedValue({
        organizationId,
      });

      await service.publishToolStart({
        runId: 'run-1',
        threadId,
        toolName: 'search',
        userId,
      } as unknown as PublishToolStartInput);

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { origin: 'stream-publisher' },
          organizationId,
          runId: 'run-1',
          threadId,
          type: 'tool.started',
          userId,
        }),
      );
    });
  });

  describe('publishToolComplete', () => {
    it('should publish with type agent:tool_complete', async () => {
      const data = {
        result: 'done',
        runId: 'run-1',
        sessionId: 'sess-1',
        toolName: 'search',
      };
      await service.publishToolComplete(
        data as unknown as PublishToolCompleteInput,
      );

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:tool_complete');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishDone', () => {
    it('should publish a single-entry batch with type agent:done when nothing is buffered', async () => {
      const data = {
        runId: 'run-1',
        sessionId: 'sess-1',
        threadId: 'thread-1',
      };
      await service.publishDone(data as unknown as PublishDoneInput);

      expect(mockRedisService.publishBatch).toHaveBeenCalledOnce();
      const [entries] = mockRedisService.publishBatch.mock.calls[0];
      expect(entries).toHaveLength(1);
      expect(entries[0].channel).toBe(CHANNEL);
      expect(entries[0].message.type).toBe('agent:done');
      expect(entries[0].message.data).toMatchObject(data);
      expect(typeof entries[0].message.data.timestamp).toBe('string');
    });

    it('should synchronously flush buffered-but-unpublished tokens before agent:done, with no trailing text lost', async () => {
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'trail',
        userId: 'user-1',
      });
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'ing',
        userId: 'user-1',
      });

      // Not yet flushed — the coalescing window has not elapsed and we have
      // not advanced fake timers.
      expect(mockRedisService.publish).not.toHaveBeenCalled();

      await service.publishDone({
        runId: 'run-1',
        sessionId: 'sess-1',
        threadId: 'thread-1',
      } as unknown as PublishDoneInput);

      expect(mockRedisService.publishBatch).toHaveBeenCalledOnce();
      const [entries] = mockRedisService.publishBatch.mock.calls[0];
      expect(entries).toHaveLength(2);
      expect(entries[0].message.type).toBe('agent:token');
      expect(entries[0].message.data.token).toBe('trailing');
      expect(entries[1].message.type).toBe('agent:done');

      // The pending timer must be cleared by the flush — advancing further
      // must not trigger a second, stale publish.
      await vi.advanceTimersByTimeAsync(DEFAULT_COALESCE_WINDOW_MS * 2);
      expect(mockRedisService.publish).not.toHaveBeenCalled();
      expect(mockRedisService.publishBatch).toHaveBeenCalledOnce();
    });

    it('should not include a flush entry for a different run on the same thread', async () => {
      await service.publishToken({
        runId: 'other-run',
        threadId: 'thread-1',
        token: 'unrelated',
        userId: 'user-1',
      });

      await service.publishDone({
        runId: 'run-1',
        threadId: 'thread-1',
      } as unknown as PublishDoneInput);

      const [entries] = mockRedisService.publishBatch.mock.calls[0];
      expect(entries).toHaveLength(1);
      expect(entries[0].message.type).toBe('agent:done');
    });
  });

  describe('publishError', () => {
    it('should publish a single-entry batch with type agent:error when nothing is buffered', async () => {
      const data = {
        error: 'something failed',
        runId: 'run-1',
        sessionId: 'sess-1',
        threadId: 'thread-1',
      };
      await service.publishError(data as unknown as PublishErrorInput);

      expect(mockRedisService.publishBatch).toHaveBeenCalledOnce();
      const [entries] = mockRedisService.publishBatch.mock.calls[0];
      expect(entries).toHaveLength(1);
      expect(entries[0].channel).toBe(CHANNEL);
      expect(entries[0].message.type).toBe('agent:error');
      expect(entries[0].message.data).toMatchObject(data);
      expect(typeof entries[0].message.data.timestamp).toBe('string');
    });

    it('should synchronously flush buffered-but-unpublished tokens before agent:error', async () => {
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'partial',
        userId: 'user-1',
      });

      await service.publishError({
        error: 'boom',
        runId: 'run-1',
        threadId: 'thread-1',
      } as unknown as PublishErrorInput);

      expect(mockRedisService.publishBatch).toHaveBeenCalledOnce();
      const [entries] = mockRedisService.publishBatch.mock.calls[0];
      expect(entries).toHaveLength(2);
      expect(entries[0].message.type).toBe('agent:token');
      expect(entries[0].message.data.token).toBe('partial');
      expect(entries[1].message.type).toBe('agent:error');
    });
  });

  describe('publishUIBlocks', () => {
    it('should publish with type agent:ui_blocks', async () => {
      const data = { blocks: [], runId: 'run-1', sessionId: 'sess-1' };
      await service.publishUIBlocks(data as unknown as PublishUIBlocksInput);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:ui_blocks');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishRunStart', () => {
    it('should publish with type agent:run_start and pass data as-is', async () => {
      const data = {
        label: 'My Run',
        organizationId: 'org-1',
        runId: 'run-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
      };
      await service.publishRunStart(data);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:run_start');
      expect(payload.data).toEqual(data);
    });
  });

  describe('publishRunProgress', () => {
    it('should publish with type agent:run_progress', async () => {
      const data = {
        organizationId: 'org-1',
        progress: 50,
        runId: 'run-1',
        timestamp: new Date().toISOString(),
        toolName: 'search',
        userId: 'user-1',
      };
      await service.publishRunProgress(data);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:run_progress');
      expect(payload.data).toEqual(data);
    });

    it('should publish without optional toolName', async () => {
      const data = {
        organizationId: 'org-1',
        progress: 100,
        runId: 'run-1',
        timestamp: new Date().toISOString(),
        userId: 'user-1',
      };
      await service.publishRunProgress(data);

      const [, payload] = mockRedisService.publish.mock.calls[0];
      expect(payload.type).toBe('agent:run_progress');
      expect(payload.data.toolName).toBeUndefined();
    });
  });

  describe('publishRunComplete', () => {
    it('should publish with type agent:run_complete for completed status', async () => {
      const data = {
        creditsUsed: 5,
        organizationId: 'org-1',
        runId: 'run-1',
        status: 'completed' as const,
        timestamp: new Date().toISOString(),
        userId: 'user-1',
      };
      await service.publishRunComplete(data);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:run_complete');
      expect(payload.data).toEqual(data);
    });

    it('should publish with failed status and error message', async () => {
      const data = {
        error: 'Out of credits',
        organizationId: 'org-1',
        runId: 'run-1',
        status: 'failed' as const,
        timestamp: new Date().toISOString(),
        userId: 'user-1',
      };
      await service.publishRunComplete(data);

      const [, payload] = mockRedisService.publish.mock.calls[0];
      expect(payload.type).toBe('agent:run_complete');
      expect(payload.data.status).toBe('failed');
      expect(payload.data.error).toBe('Out of credits');
    });
  });

  describe('timestamp injection', () => {
    it('should inject a valid ISO timestamp on a flushed token batch', async () => {
      const before = Date.now();
      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'hi',
        userId: 'user-1',
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_COALESCE_WINDOW_MS);
      const after = Date.now();

      const { timestamp } = mockRedisService.publish.mock.calls[0][1].data;
      const ts = new Date(timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('error propagation', () => {
    it('should propagate errors from redisService.publish on an immediate byte-threshold flush', async () => {
      mockRedisService.publish.mockRejectedValueOnce(new Error('Redis down'));
      const largeToken = 'a'.repeat(DEFAULT_COALESCE_MAX_BYTES);

      await expect(
        service.publishToken({
          runId: 'run-1',
          threadId: 'thread-1',
          token: largeToken,
          userId: 'user-1',
        }),
      ).rejects.toThrow('Redis down');
    });

    it('should log and swallow errors from a timer-triggered flush instead of throwing', async () => {
      mockRedisService.publish.mockRejectedValueOnce(new Error('Redis down'));

      await service.publishToken({
        runId: 'run-1',
        threadId: 'thread-1',
        token: 'hi',
        userId: 'user-1',
      });

      await expect(
        vi.advanceTimersByTimeAsync(DEFAULT_COALESCE_WINDOW_MS),
      ).resolves.not.toThrow();

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('coalesced token flush failed'),
        expect.objectContaining({ error: 'Redis down' }),
      );
    });

    it('should propagate errors from redisService.publishBatch on publishDone', async () => {
      mockRedisService.publishBatch.mockRejectedValueOnce(
        new Error('Redis down'),
      );

      await expect(
        service.publishDone({
          runId: 'run-1',
          threadId: 'thread-1',
        } as unknown as PublishDoneInput),
      ).rejects.toThrow('Redis down');
    });
  });
});
