import { escapeSystemEmailHtml } from '@helpers/email/system-email.helper';
import { discordWebhookUrl } from '@libs/security/discord-webhook-url';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '@notifications/guards/internal-api-key.guard';
import { DiscordService } from '@notifications/services/discord/discord.service';
import {
  discordMessage,
  validateSystemEvent,
} from '@notifications/services/discord/system-notification.util';
import { ResendService } from '@notifications/services/resend/resend.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

@Controller('internal/system-notifications')
@UseGuards(InternalApiKeyGuard)
export class SystemNotificationsController {
  constructor(
    private readonly discord: DiscordService,
    private readonly telegram: TelegramService,
    private readonly email: ResendService,
  ) {}

  @Get()
  status() {
    return { isAvailable: true };
  }

  @Post()
  @HttpCode(200)
  async deliver(@Body() body: unknown) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('Invalid delivery');
    const event = validateSystemEvent(Reflect.get(body, 'event'));
    const target: unknown = Reflect.get(body, 'target');
    const idempotencyKey: unknown = Reflect.get(body, 'idempotencyKey');
    if (
      !target ||
      typeof target !== 'object' ||
      typeof idempotencyKey !== 'string' ||
      !/^[a-zA-Z0-9_./-]{1,250}$/.test(idempotencyKey)
    )
      throw new BadRequestException('Invalid delivery');
    const provider: unknown = Reflect.get(target, 'provider');
    const embed = discordMessage(event).embeds[0];
    const text = [
      embed.title,
      ...embed.fields.map((field) => `${field.name}: ${field.value}`),
      event.occurredAt,
    ].join('\n');
    try {
      if (provider === 'discord') {
        const url: unknown = Reflect.get(target, 'webhookUrl');
        if (typeof url !== 'string' || !discordWebhookUrl(url))
          throw new BadRequestException('Invalid Discord destination');
        await this.discord.sendSystemNotification(event, url);
      } else if (provider === 'telegram') {
        const chatId: unknown = Reflect.get(target, 'chatId');
        if (typeof chatId !== 'string' || !/^-?\d{1,20}$/.test(chatId))
          throw new BadRequestException('Invalid Telegram destination');
        await this.telegram.sendSystemMessage(chatId, text);
      } else if (provider === 'email') {
        const address: unknown = Reflect.get(target, 'address');
        if (
          typeof address !== 'string' ||
          address.length > 320 ||
          !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address)
        )
          throw new BadRequestException('Invalid email destination');
        const emailId = await this.email.sendEmail({
          to: address,
          subject: embed.title,
          text,
          html: `<pre>${escapeSystemEmailHtml(text)}</pre>`,
          idempotencyKey,
        });
        if (!emailId) throw new Error('Email is not configured');
      } else throw new BadRequestException('Unsupported destination provider');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException(
        'System notification delivery failed',
      );
    }
    return { delivered: true };
  }
}
