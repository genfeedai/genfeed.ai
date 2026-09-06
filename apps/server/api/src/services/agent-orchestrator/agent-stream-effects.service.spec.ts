import { AgentStreamEffectsService } from './agent-stream-effects.service';

describe('durable failure publication', () => {
  function setup() {
    const publisher = { publishError: vi.fn(), publishWorkEvent: vi.fn() };
    const logger = { warn: vi.fn() };
    const prisma = {
      notificationEvent: {
        upsert: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const service = new AgentStreamEffectsService(
      publisher as never,
      logger as never,
      prisma as never,
    );
    return { publisher, logger, prisma, service };
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

  it('records a scrubbed durable event when Redis cannot publish the failure', async () => {
    const { service, publisher, prisma } = setup();
    publisher.publishError.mockRejectedValue(
      new Error('ECONNREFUSED Bearer super-secret-value'),
    );
    await service.publishStreamFailure(params);
    await service.publishStreamFailure(params);
    const event = prisma.notificationEvent.upsert.mock.calls[0][0];
    expect(event.create).toEqual(
      expect.objectContaining({
        eventKey: 'agent.failure.delivery_failed',
        organizationId: 'org-1',
        sourceId: 'run-1',
        sourceType: 'agent_run',
        payload: expect.objectContaining({
          channel: 'stream',
          threadId: 'thread-1',
        }),
      }),
    );
    expect(event.where.deduplicationKey).toBe(
      'org-1/agent.failure.delivery_failed/run-1',
    );
    expect(prisma.notificationEvent.upsert.mock.calls[1][0].where).toEqual(
      event.where,
    );
    expect(JSON.stringify(event)).not.toContain('super-secret-value');
  });

  it('does not record a delivery failure after successful publication', async () => {
    const { service, prisma, publisher } = setup();
    await service.publishStreamFailure(params);
    expect(publisher.publishWorkEvent).toHaveBeenCalled();
    expect(prisma.notificationEvent.upsert).not.toHaveBeenCalled();
  });

  it('propagates a durable recording outage rather than discarding it', async () => {
    const { service, publisher, prisma, logger } = setup();
    publisher.publishError.mockRejectedValue(new Error('Redis unavailable'));
    prisma.notificationEvent.upsert.mockRejectedValue(
      new Error('Database unavailable'),
    );
    await expect(service.publishStreamFailure(params)).rejects.toThrow(
      'Database unavailable',
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.notificationEvent.upsert.mock.invocationCallOrder[0],
    );
  });
});
