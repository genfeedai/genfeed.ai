import type { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import type { ContextEmbeddingSweepService } from '@api/collections/contexts/services/context-embedding-sweep.service';
import type { NotificationDeliveryRecoveryService } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.service';
import { PlatformRecoverySchedulesService } from '@workers/scheduling/platform-recovery-schedules.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const notifications = { recover: vi.fn().mockResolvedValue(undefined) };
  const brands = { recover: vi.fn().mockResolvedValue(undefined) };
  const embeddings = { sweep: vi.fn().mockResolvedValue(undefined) };
  const service = new PlatformRecoverySchedulesService(
    notifications as unknown as NotificationDeliveryRecoveryService,
    brands as unknown as BrandRelocationJobsService,
    embeddings as unknown as ContextEmbeddingSweepService,
  );
  return { service, notifications, brands, embeddings };
}
describe('platform recovery delegation', () => {
  it('awaits one embedding sweep without dispatching unrelated recovery', async () => {
    const f = fixture();
    let release!: () => void;
    f.embeddings.sweep.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let completed = false;
    const running = f.service.recoverContextEmbeddings().then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(f.embeddings.sweep).toHaveBeenCalledExactlyOnceWith();
    expect(completed).toBe(false);
    release();
    await running;
    expect(completed).toBe(true);
    expect(f.notifications.recover).not.toHaveBeenCalled();
    expect(f.brands.recover).not.toHaveBeenCalled();
  });
  it('propagates a sweep failure to its scheduled task', async () => {
    const f = fixture();
    const failure = new Error('database unavailable');
    f.embeddings.sweep.mockRejectedValue(failure);
    await expect(f.service.recoverContextEmbeddings()).rejects.toBe(failure);
    expect(f.embeddings.sweep).toHaveBeenCalledOnce();
  });
  it('preserves existing notification and brand recovery', async () => {
    const f = fixture();
    await f.service.recoverNotifications();
    await f.service.recoverBrandRelocations();
    expect(f.notifications.recover).toHaveBeenCalledExactlyOnceWith();
    expect(f.brands.recover).toHaveBeenCalledExactlyOnceWith();
    expect(f.embeddings.sweep).not.toHaveBeenCalled();
  });
});
