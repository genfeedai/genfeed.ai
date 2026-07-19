import { RemotionRenderCancellationService } from '@files/services/remotion/remotion-render-cancellation.service';

describe('RemotionRenderCancellationService', () => {
  const redisService = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { log: vi.fn(), warn: vi.fn() };

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('cancels the local render and broadcasts to other workers', async () => {
    const service = new RemotionRenderCancellationService(
      redisService as never,
      logger as never,
    );
    const cancel = vi.fn();
    service.register('job-123', cancel);

    await service.request('job-123', '2026-07-19T00:00:00.000Z');

    expect(cancel).toHaveBeenCalledOnce();
    expect(redisService.publish).toHaveBeenCalledWith('editor-render-cancel', {
      jobId: 'job-123',
      requestedAt: '2026-07-19T00:00:00.000Z',
    });
  });

  it('routes a remote cancellation event to the owning worker', async () => {
    const service = new RemotionRenderCancellationService(
      redisService as never,
      logger as never,
    );
    const cancel = vi.fn();
    service.register('job-123', cancel);
    await service.onModuleInit();
    const handler = redisService.subscribe.mock.calls[0]?.[1];

    handler?.({
      jobId: 'job-123',
      requestedAt: '2026-07-19T00:00:00.000Z',
    });

    expect(cancel).toHaveBeenCalledOnce();
  });

  it('applies a cancellation that arrives before renderer registration', async () => {
    vi.useFakeTimers();
    const service = new RemotionRenderCancellationService(
      redisService as never,
      logger as never,
    );
    await service.onModuleInit();
    const handler = redisService.subscribe.mock.calls[0]?.[1];
    handler?.({
      jobId: 'job-123',
      requestedAt: '2026-07-19T00:00:00.000Z',
    });
    const cancel = vi.fn();

    service.register('job-123', cancel);

    expect(cancel).toHaveBeenCalledOnce();
    expect(logger.log).toHaveBeenCalledWith(
      'Applying pending editor render cancellation',
      { jobId: 'job-123' },
    );
  });
});
