import { LifecycleEmailQueueService } from '@api/services/lifecycle-emails/lifecycle-email-queue.service';
import type { LifecycleEmailJobData } from '@genfeedai/queue-contracts';

describe('LifecycleEmailQueueService.scheduleEmail', () => {
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  function makeService() {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    return {
      queue,
      service: new LifecycleEmailQueueService(queue as never, logger as never),
    };
  }

  function jobData(
    overrides: Partial<LifecycleEmailJobData> = {},
  ): LifecycleEmailJobData {
    return {
      sequence: 'abandoned-checkout',
      step: 'checkout-recovery',
      triggerKey: 'checkout:cs_live_123',
      userId: 'user_1',
      ...overrides,
    } as LifecycleEmailJobData;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never puts ":" in the BullMQ job id', async () => {
    // Regression: trigger keys carry ':' (`signup:{userId}`,
    // `checkout:{sessionId}`) and the job id was joined with ':', so BullMQ
    // rejected every lifecycle email with "Custom Id cannot contain :".
    const { queue, service } = makeService();

    await service.scheduleEmail(jobData(), new Date(Date.now() + 1_000));

    expect(queue.add).toHaveBeenCalledTimes(1);
    const options = queue.add.mock.calls[0][2] as { jobId: string };
    expect(options.jobId).not.toContain(':');
    expect(options.jobId).toBe(
      'lifecycle-email-user_1-abandoned-checkout-checkout-recovery-checkout-cs_live_123',
    );
  });

  it('keeps the job id deterministic so BullMQ dedupe still applies', async () => {
    const { queue, service } = makeService();

    await service.scheduleEmail(jobData(), new Date(Date.now() + 1_000));
    await service.scheduleEmail(jobData(), new Date(Date.now() + 60_000));

    const [first, second] = queue.add.mock.calls.map(
      (call) => (call[2] as { jobId: string }).jobId,
    );
    expect(first).toBe(second);
  });

  it('clamps past schedules to zero delay', async () => {
    const { queue, service } = makeService();

    await service.scheduleEmail(jobData(), new Date(Date.now() - 60_000));

    const options = queue.add.mock.calls[0][2] as { delay: number };
    expect(options.delay).toBe(0);
  });
});
