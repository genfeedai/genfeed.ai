import type { AddressInfo } from 'node:net';
import { LoggerService } from '@libs/logger/logger.service';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordService } from '@notifications/services/discord/discord.service';
import type { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import {
  discordMessage,
  discordWebhookUrl,
  validateSystemEvent,
} from '@notifications/services/discord/system-notification.util';
import { SystemNotificationsController } from '@notifications/services/discord/system-notifications.controller';
import { afterEach, describe, expect, it, vi } from 'vitest';

const event = {
  version: 1,
  id: 'user.created/u1',
  type: 'user.created',
  occurredAt: '2026-09-23T12:00:00Z',
  data: { objectId: 'u1', email: '@everyone@example.com' },
};
function service(webhook = 'https://discord.com/api/webhooks/123/secret') {
  return new DiscordService(
    {
      get: () => webhook,
      isDiscordEnabled: () => false,
    } as unknown as ConfigService,
    { log: vi.fn() } as unknown as LoggerService,
    {} as DiscordBotService,
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('standalone system notification delivery', () => {
  it('validates payloads, strips unknown fields and prevents mentions', () => {
    expect(
      validateSystemEvent({
        ...event,
        data: { ...event.data, secret: 'private' },
      }).data,
    ).toEqual(event.data);
    expect(() =>
      validateSystemEvent({ ...event, id: '', data: { objectId: 'u1' } }),
    ).toThrow();
    expect(discordMessage(validateSystemEvent(event)).allowed_mentions).toEqual(
      { parse: [] },
    );
    const free = validateSystemEvent({
      ...event,
      type: 'credits.purchased',
      data: { objectId: 'cs_1', amountMinor: 0, currency: 'usd' },
    });
    expect(discordMessage(free).embeds[0].title).toContain('Free redemption');
  });
  it('rejects non-Discord destinations and does not send when unconfigured', async () => {
    for (const url of [
      'https://discord.com.evil.example/api/webhooks/123/token',
      'http://discord.com/api/webhooks/123/token',
      'https://127.0.0.1/api/webhooks/123/token',
      'https://user@discord.com/api/webhooks/123/token',
    ])
      expect(discordWebhookUrl(url)).toBeNull();
    vi.stubGlobal('fetch', vi.fn());
    expect(service('').systemNotificationStatus()).toEqual({
      webhookConfigured: false,
    });
    await expect(
      service('').sendSystemNotification(validateSystemEvent(event)),
    ).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('acknowledges provider acceptance and reports retryable failures without leaking credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 200 })),
    );
    await service().sendSystemNotification(validateSystemEvent(event));
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'discord.com',
        search: '?wait=true',
      }),
      expect.objectContaining({ redirect: 'error' }),
    );
    vi.mocked(fetch).mockRejectedValue(
      new Error('https://discord.com/api/webhooks/123/secret'),
    );
    await expect(
      service().sendSystemNotification(validateSystemEvent(event)),
    ).rejects.toThrow('System notification delivery failed');
  });
  it('requires the deployment internal credential for status and delivery', async () => {
    const sendSystemNotification = vi.fn();
    const module = await Test.createTestingModule({
      controllers: [SystemNotificationsController],
      providers: [
        {
          provide: DiscordService,
          useValue: {
            sendSystemNotification,
            systemNotificationStatus: () => ({ webhookConfigured: true }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: () => 'deployment-key', isDevelopment: false },
        },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    }).compile();
    const app: INestApplication = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/internal/system-notifications`;
    try {
      expect((await fetch(base)).status).toBe(401);
      expect(
        (
          await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(base, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer deployment-key',
            },
            body: JSON.stringify(event),
          })
        ).status,
      ).toBe(200);

      expect(sendSystemNotification).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });
});
