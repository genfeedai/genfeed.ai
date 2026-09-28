import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { ActivityKey } from '@genfeedai/contracts';
import { AgentStreamEffectsService } from './agent-stream-effects.service';

describe('durable failure publication', () => {
  function setup() {
    const publisher = { publishError: vi.fn(), publishWorkEvent: vi.fn() };
    const logger = { warn: vi.fn() };
    const activityRecorder = {
      record: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    };
    const service = new AgentStreamEffectsService(
      publisher as never,
      logger as never,
      activityRecorder as never,
    );
    return { activityRecorder, logger, publisher, service };
  }
  const params = {
    context: {
      organizationId: 'org-1',
      userId: 'user-1',
      executionId: 'run-1',
    },
    error: 'HTTP 429',
    threadId: 'thread-1',
  };

  it('records a scrubbed durable activity when Redis cannot publish the failure', async () => {
    const { activityRecorder, service, publisher } = setup();
    publisher.publishError.mockRejectedValue(
      new Error('ECONNREFUSED Bearer super-secret-value'),
    );
    await service.publishStreamFailure(params);
    await service.publishStreamFailure(params);
    const [activity] = activityRecorder.record.mock.calls[0];
    expect(activity).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: 'stream',
          threadId: 'thread-1',
        }),
        entityId: 'run-1',
        id: `${ActivityKey.AGENT_RUN_DELIVERY_FAILED}:org-1:run-1`,
        key: ActivityKey.AGENT_RUN_DELIVERY_FAILED,
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
    // The deterministic id makes the second record for the same run a no-op.
    expect(activityRecorder.record.mock.calls[1][0].id).toBe(activity.id);
    expect(JSON.stringify(activity)).not.toContain('super-secret-value');
  });

  it('does not record a delivery failure after successful publication', async () => {
    const { activityRecorder, service, publisher } = setup();
    await service.publishStreamFailure(params);
    expect(publisher.publishWorkEvent).toHaveBeenCalled();
    expect(activityRecorder.record).not.toHaveBeenCalled();
  });

  it('propagates a durable recording outage rather than discarding it', async () => {
    const { activityRecorder, service, publisher, logger } = setup();
    publisher.publishError.mockRejectedValue(new Error('Redis unavailable'));
    activityRecorder.record.mockRejectedValue(
      new Error('Database unavailable'),
    );
    await expect(service.publishStreamFailure(params)).rejects.toThrow(
      'Database unavailable',
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn.mock.invocationCallOrder[0]).toBeLessThan(
      activityRecorder.record.mock.invocationCallOrder[0],
    );
  });
});

describe('best-effort turn phases', () => {
  it('forwards scoped phases and contains failures without logging request content or raw errors', async () => {
    const publisher = { publishTurnPhase: vi.fn() };
    const logger = { warn: vi.fn() };
    const service = new AgentStreamEffectsService(
      publisher as never,
      logger as never,
      {} as never,
    );
    const data = {
      organizationId: 'org-1',
      phase: 'preparing' as const,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: '2026-09-24T10:00:00.000Z',
      userId: 'user-1',
    };
    await service.publishTurnPhase(data);
    expect(publisher.publishTurnPhase).toHaveBeenCalledWith(data);
    expect(logger.warn).not.toHaveBeenCalled();
    publisher.publishTurnPhase.mockRejectedValueOnce(
      new Error('Bearer secret request content'),
    );
    await expect(
      service.publishTurnPhase({ ...data, runId: 'run-1\n\t' }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'AgentStreamEffectsService turn phase publish failed',
      { phase: 'preparing', runId: 'run-1' },
    );
  });
});

describe('ui-action run settlement', () => {
  function setup() {
    const publisher = { publishRecordedRunSettled: vi.fn() };
    const service = new AgentStreamEffectsService(
      publisher as never,
      { warn: vi.fn() } as never,
      { record: vi.fn() } as never,
    );
    return { publisher, service };
  }
  const result: AgentChatResult = {
    creditsRemaining: 90,
    creditsUsed: 0,
    message: {
      content: 'Approved action failed: Provider unavailable',
      metadata: { uiActions: [] },
      role: 'assistant',
    },
    threadId: 'thread-1',
    toolCalls: [],
  };
  const settle = (service: AgentStreamEffectsService, runResult = result) =>
    service.publishUiActionDone({
      context: { executionId: 'exec-1', organizationId: 'org-1', userId: 'u' },
      result: runResult,
      sequence: 7,
      threadId: 'thread-1',
      uiAction: { action: 'confirm_mutation', sourceId: 'card-1' },
    });

  it('settles a mutation that failed without throwing as failed, with its reply', async () => {
    const { publisher, service } = setup();

    await settle(service, {
      ...result,
      runOutcome: { error: 'Provider unavailable', status: 'failed' },
    });

    expect(publisher.publishRecordedRunSettled).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: 'Provider unavailable',
        fullContent: 'Approved action failed: Provider unavailable',
        runId: 'exec-1',
        runStatus: 'failed',
        sequence: 7,
      }),
      type: 'agent:done',
    });
  });

  it('settles a successful run as completed', async () => {
    const { publisher, service } = setup();

    await settle(service);

    const [{ data }] = publisher.publishRecordedRunSettled.mock.calls[0];
    expect(data.runStatus).toBe('completed');
    expect(data).not.toHaveProperty('error');
  });
});
