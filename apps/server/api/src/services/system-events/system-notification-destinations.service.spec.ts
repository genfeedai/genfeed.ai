import type { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(),
    systemNotificationDestination: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }) => ({ id: 'destination_1', ...data })),
      findFirst: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
  const crypto = {
    encrypt: vi.fn(() => 'encrypted-secret'),
    decrypt: vi.fn(() => 'https://discord.com/api/webhooks/123/token'),
  };
  const service = new SystemNotificationDestinationsService(
    prisma as unknown as PrismaService,
    crypto as unknown as CredentialCryptoService,
    { deliverSystemNotification: vi.fn() } as unknown as NotificationsService,
  );
  return { service, prisma, crypto };
}

describe('admin system notification destinations', () => {
  const input = {
    label: 'Signups',
    provider: 'discord',
    isEnabled: true,
    eventTypes: ['user.created'],
    address: 'https://discord.com/api/webhooks/123/token',
  };

  it('encrypts webhook credentials and never returns them to admin', async () => {
    const { service, prisma, crypto } = setup();
    const destination = await service.save(input);
    expect(crypto.encrypt).toHaveBeenCalledWith(input.address);
    expect(prisma.systemNotificationDestination.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          address: null,
          webhookEncrypted: 'encrypted-secret',
        }),
      }),
    );
    expect(destination.address).toBeNull();
    expect(destination.hasCredentials).toBe(true);
    expect(JSON.stringify(destination)).not.toContain('token');
    expect(JSON.stringify(destination)).not.toContain('encrypted-secret');
  });

  it.each([
    'https://discord.com.evil.example/api/webhooks/123/token',
    'http://discord.com/api/webhooks/123/token',
    'https://localhost/token',
  ])('rejects %s without persisting', async (address) => {
    const { service, prisma } = setup();
    await expect(service.save({ ...input, address })).rejects.toThrow();
    expect(prisma.systemNotificationDestination.create).not.toHaveBeenCalled();
  });

  it('preserves a stored webhook when editing only event filters', async () => {
    const { service, prisma, crypto } = setup();
    prisma.systemNotificationDestination.findFirst.mockResolvedValue({
      id: 'd1',
      ...input,
      address: null,
      webhookEncrypted: 'existing',
    });
    await service.save(
      { ...input, address: undefined, eventTypes: ['payment.failed'] },
      'd1',
    );
    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(
      prisma.systemNotificationDestination.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ webhookEncrypted: 'existing' }),
      }),
    );
  });

  it('refuses a new destination once the fanout limit is reached', async () => {
    const { service, prisma } = setup();
    prisma.systemNotificationDestination.count.mockResolvedValue(10);
    await expect(service.save(input)).rejects.toThrow('up to 10');
    expect(prisma.systemNotificationDestination.create).not.toHaveBeenCalled();
  });

  it('rejects unknown events and credential-free new destinations', async () => {
    const { service } = setup();
    await expect(
      service.save({ ...input, eventTypes: ['unknown'] }),
    ).rejects.toThrow();
    await expect(
      service.save({ ...input, address: undefined }),
    ).rejects.toThrow();
  });
});
