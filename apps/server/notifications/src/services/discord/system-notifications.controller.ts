import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '@notifications/guards/internal-api-key.guard';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { validateSystemEvent } from '@notifications/services/discord/system-notification.util';

@Controller('internal/system-notifications')
@UseGuards(InternalApiKeyGuard)
export class SystemNotificationsController {
  constructor(private readonly discord: DiscordService) {}
  @Get()
  status() {
    return this.discord.systemNotificationStatus();
  }
  @Post()
  @HttpCode(200)
  async deliver(@Body() body: unknown) {
    await this.discord.sendSystemNotification(validateSystemEvent(body));
    return { delivered: true };
  }
}
