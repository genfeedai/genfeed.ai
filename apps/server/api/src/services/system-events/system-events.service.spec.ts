import { createHmac } from 'node:crypto';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/security/destination-guard', () => ({ safeFetch: vi.fn() }));
const payload = JSON.stringify({
  version: 1,
  id: 'user.created/u1',
  type: 'user.created',
  occurredAt: '2026-09-23T12:00:00Z',
  data: { objectId: 'u1' },
});
function setup(enabled = true) {
  const values: Record<string, string> = enabled
    ? {
        SYSTEM_EVENTS_WEBHOOK_URL: 'https://receiver.example/events',
        SYSTEM_EVENTS_WEBHOOK_SECRET: 'a'.repeat(32),
        SYSTEM_EVENTS_ENABLED_AT: '2026-09-23T00:00:00Z',
      }
    : {};
  const prisma = {
    user: { findFirst: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    systemEventWebhook: {
      upsert: vi.fn(),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'user.created/u1', payload, attempts: 0 }]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new SystemEventsService(
    prisma as unknown as PrismaService,
    { get: (key: string) => values[key] } as ConfigService,
    { warn: vi.fn() } as unknown as LoggerService,
  );
  return { service, prisma };
}
describe('system event outbox', () => {
  beforeEach(() => vi.clearAllMocks());
  it('is disabled without complete operator configuration', async () => {
    const { service, prisma } = setup(false);
    await service.recover();
    await service.recordSignup('u1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
  it('does not backfill users before enablement and uses stable IDs for current users', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: null,
      createdAt: new Date('2026-09-22'),
    });
    await service.recordSignup('u1');
    expect(prisma.systemEventWebhook.upsert).not.toHaveBeenCalled();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: null,
      createdAt: new Date('2026-09-23T12:00:00Z'),
    });
    await service.recordSignup('u1');
    expect(prisma.systemEventWebhook.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user.created/u1' }, update: {} }),
    );
  });
  it('recovers a missed signup hook from canonical users', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'u2' }]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u2',
      email: 'new@example.com',
      createdAt: new Date('2026-09-23T12:00:00Z'),
    });
    prisma.systemEventWebhook.findMany.mockResolvedValue([]);
    await service.recover();
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u2', isDeleted: false } }),
    );
    expect(prisma.systemEventWebhook.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user.created/u2' }, update: {} }),
    );
  });
  it('signs a fresh delivery and records successful delivery under the lease', async () => {
    const { service, prisma } = setup();
    vi.mocked(safeFetch).mockResolvedValue(new Response('', { status: 200 }));
    await service.recover();
    const [, request] = vi.mocked(safeFetch).mock.calls[0];
    const headers = request?.headers as Record<string, string>;
    expect(headers['X-Genfeed-Signature']).toBe(
      createHmac('sha256', 'a'.repeat(32))
        .update(`${headers['X-Genfeed-Timestamp']}.${payload}`)
        .digest('hex'),
    );
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveredAt: expect.any(Date),
          lastStatusCode: 200,
        }),
      }),
    );
  });
  it('reschedules failed delivery and does not send when another worker owns the lease', async () => {
    const { service, prisma } = setup();
    vi.mocked(safeFetch).mockRejectedValue(new Error('secret request URL'));
    await service.recover();
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: expect.any(Date),
          leaseToken: null,
        }),
      }),
    );
    vi.mocked(safeFetch).mockClear();
    prisma.systemEventWebhook.updateMany.mockResolvedValue({ count: 0 });
    await service.recover();
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
