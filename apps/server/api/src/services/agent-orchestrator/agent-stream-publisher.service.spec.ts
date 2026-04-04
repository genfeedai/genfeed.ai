import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import { Effect } from 'effect';

const CHANNEL = 'agent-chat';

const mockRedisService = {
  publish: vi.fn(),
};

const mockAgentThreadsService = {
  findOne: vi.fn(),
};

const mockAgentThreadEngineService = {
  appendEvent: vi.fn(),
  appendEventEffect: vi.fn(() => Effect.void),
};

describe('AgentStreamPublisherService', () => {
  let service: AgentStreamPublisherService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AgentStreamPublisherService(
      mockRedisService as any,
      mockAgentThreadsService as any,
      mockAgentThreadEngineService as any,
    );
  });

  describe('publishStreamStart', () => {
    it('should publish to agent-chat with type agent:stream_start', async () => {
      const data = {
        organizationId: 'org-1',
        runId: 'run-1',
        sessionId: 'sess-1',
        userId: 'user-1',
      };
      await service.publishStreamStart(data as any);

      expect(mockRedisService.publish).toHaveBeenCalledOnce();
      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:stream_start');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishToken', () => {
    it('should publish to agent-chat with type agent:token', async () => {
      const data = { runId: 'run-1', sessionId: 'sess-1', token: 'hello' };
      await service.publishToken(data as any);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:token');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishReasoning', () => {
    it('should publish with type agent:reasoning', async () => {
      const data = {
        reasoning: 'thinking...',
        runId: 'run-1',
        sessionId: 'sess-1',
      };
      await service.publishReasoning(data as any);

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
      await service.publishToolStart(data as any);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:tool_start');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });

    it('persists a thread event when the thread is valid', async () => {
      mockAgentThreadsService.findOne.mockResolvedValue({
        organization: '65f08f2a82e7b4f12e4db001',
      });

      await service.publishToolStart({
        runId: 'run-1',
        threadId: '65f08f2a82e7b4f12e4db002',
        toolName: 'search',
        userId: '65f08f2a82e7b4f12e4db003',
      } as any);

      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledOnce();
      expect(
        mockAgentThreadEngineService.appendEventEffect,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { origin: 'stream-publisher' },
          organizationId: '65f08f2a82e7b4f12e4db001',
          runId: 'run-1',
          threadId: '65f08f2a82e7b4f12e4db002',
          type: 'tool.started',
          userId: '65f08f2a82e7b4f12e4db003',
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
      await service.publishToolComplete(data as any);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:tool_complete');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishDone', () => {
    it('should publish with type agent:done', async () => {
      const data = { runId: 'run-1', sessionId: 'sess-1' };
      await service.publishDone(data as any);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:done');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishError', () => {
    it('should publish with type agent:error', async () => {
      const data = {
        error: 'something failed',
        runId: 'run-1',
        sessionId: 'sess-1',
      };
      await service.publishError(data as any);

      const [channel, payload] = mockRedisService.publish.mock.calls[0];
      expect(channel).toBe(CHANNEL);
      expect(payload.type).toBe('agent:error');
      expect(payload.data).toMatchObject(data);
      expect(typeof payload.data.timestamp).toBe('string');
    });
  });

  describe('publishUIBlocks', () => {
    it('should publish with type agent:ui_blocks', async () => {
      const data = { blocks: [], runId: 'run-1', sessionId: 'sess-1' };
      await service.publishUIBlocks(data as any);

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
    it('should inject a valid ISO timestamp on stream events', async () => {
      const before = Date.now();
      await service.publishToken({
        runId: 'r',
        sessionId: 's',
        token: 'hi',
      } as any);
      const after = Date.now();

      const { timestamp } = mockRedisService.publish.mock.calls[0][1].data;
      const ts = new Date(timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('error propagation', () => {
    it('should propagate errors from redisService.publish', async () => {
      mockRedisService.publish.mockRejectedValueOnce(new Error('Redis down'));
      await expect(
        service.publishToken({
          runId: 'r',
          sessionId: 's',
          token: 'hi',
        } as any),
      ).rejects.toThrow('Redis down');
    });
  });
});
