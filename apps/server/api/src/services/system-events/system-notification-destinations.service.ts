import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ISystemNotificationDestination,
  SystemNotificationProvider,
} from '@genfeedai/contracts/interfaces';
import type { SystemNotificationDestination } from '@genfeedai/prisma';
import {
  SYSTEM_EVENT_TYPES,
  type SystemEvent,
  type SystemNotificationTarget,
} from '@libs/interfaces/system-event.interface';
import { discordWebhookUrl } from '@libs/security/discord-webhook-url';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class SystemNotificationDestinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(): Promise<ISystemNotificationDestination[]> {
    // tenant-scope-ignore: super-admin deployment destinations, never tenant routes
    const rows = await this.prisma.systemNotificationDestination.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.publicDestination(row));
  }

  private publicDestination(
    row: SystemNotificationDestination,
  ): ISystemNotificationDestination {
    return {
      id: row.id,
      label: row.label,
      provider: row.provider as SystemNotificationProvider,
      isEnabled: row.isEnabled,
      eventTypes: row.eventTypes,
      address: row.provider === 'discord' ? null : row.address,
      hasCredentials: Boolean(row.webhookEncrypted),
    };
  }

  async save(
    input: unknown,
    id?: string,
  ): Promise<ISystemNotificationDestination> {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Invalid destination');
    const label: unknown = Reflect.get(input, 'label');
    const provider: unknown = Reflect.get(input, 'provider');
    const isEnabled: unknown = Reflect.get(input, 'isEnabled');
    const eventTypes: unknown = Reflect.get(input, 'eventTypes');
    const address: unknown = Reflect.get(input, 'address');
    if (
      typeof label !== 'string' ||
      !label.trim() ||
      label.length > 80 ||
      /[\r\n]/.test(label) ||
      !['discord', 'telegram', 'email'].includes(String(provider)) ||
      typeof isEnabled !== 'boolean' ||
      !Array.isArray(eventTypes) ||
      !eventTypes.every((type) => SYSTEM_EVENT_TYPES.includes(type)) ||
      (address !== undefined && typeof address !== 'string')
    )
      throw new BadRequestException(
        'Select a valid destination and notification events',
      );
    // tenant-scope-ignore: super-admin edits one deployment destination
    const existing = id
      ? await this.prisma.systemNotificationDestination.findFirst({
          where: { id, isDeleted: false },
        })
      : null;
    if (id && !existing) throw new NotFoundException('Destination not found');
    if (existing && provider !== existing.provider)
      throw new BadRequestException(
        'Create a new destination to change its provider',
      );
    const value = typeof address === 'string' ? address.trim() : undefined;
    let webhookEncrypted = existing?.webhookEncrypted ?? null;
    let storedAddress = existing?.address ?? null;
    if (provider === 'discord') {
      if (value !== undefined) {
        if (!discordWebhookUrl(value))
          throw new BadRequestException('Enter a valid Discord webhook URL');
        webhookEncrypted = this.crypto.encrypt(value);
      }
      if (!webhookEncrypted)
        throw new BadRequestException('Discord webhook is required');
      storedAddress = null;
    } else {
      if (value !== undefined) storedAddress = value;
      if (
        !storedAddress ||
        storedAddress.length > 320 ||
        (provider === 'telegram'
          ? !/^-?\d{1,20}$/.test(storedAddress)
          : !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(storedAddress))
      )
        throw new BadRequestException('Enter a valid chat ID or email address');
      webhookEncrypted = null;
    }
    const data = {
      label: label.trim(),
      provider: provider as SystemNotificationProvider,
      isEnabled,
      eventTypes: [...new Set<string>(eventTypes)],
      address: storedAddress,
      webhookEncrypted,
    };
    if (existing) {
      // tenant-scope-ignore: scoped by the exact super-admin destination ID
      const updated =
        await this.prisma.systemNotificationDestination.updateMany({
          where: { id: existing.id, isDeleted: false },
          data,
        });
      if (!updated.count) throw new NotFoundException('Destination not found');
      return this.publicDestination({ ...existing, ...data });
    }
    return this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: serialize creates to enforce the deployment fanout limit
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('system-notification-destinations'))`;
      // tenant-scope-ignore: deployment-wide bounded fanout, never user destinations
      if (
        (await tx.systemNotificationDestination.count({
          where: { isDeleted: false },
        })) >= 10
      )
        throw new BadRequestException(
          'A deployment supports up to 10 system notification destinations',
        );
      // tenant-scope-ignore: super-admin creates a deployment destination
      return this.publicDestination(
        await tx.systemNotificationDestination.create({ data }),
      );
    });
  }

  async remove(id: string): Promise<void> {
    // tenant-scope-ignore: explicit super-admin soft deletion
    const result = await this.prisma.systemNotificationDestination.updateMany({
      where: { id, isDeleted: false },
      data: {
        isDeleted: true,
        isEnabled: false,
        webhookEncrypted: null,
        address: null,
      },
    });
    if (!result.count) throw new NotFoundException('Destination not found');
  }

  target(row: SystemNotificationDestination): SystemNotificationTarget {
    if (row.provider === 'discord' && row.webhookEncrypted)
      return {
        provider: 'discord',
        webhookUrl: this.crypto.decrypt(row.webhookEncrypted),
      };
    if (row.provider === 'telegram' && row.address)
      return { provider: 'telegram', chatId: row.address };
    if (row.provider === 'email' && row.address)
      return { provider: 'email', address: row.address };
    throw new BadRequestException('Destination is not configured');
  }

  async test(id: string): Promise<void> {
    // tenant-scope-ignore: explicit operator test, never a production user event
    const row = await this.prisma.systemNotificationDestination.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Destination not found');
    const event: SystemEvent = {
      version: 1,
      id: `test/${row.id}/${Date.now()}`,
      type: 'user.created',
      occurredAt: new Date().toISOString(),
      data: { objectId: 'test-notification' },
    };
    await this.notifications.deliverSystemNotification(
      event,
      this.target(row),
      event.id,
    );
  }
}
