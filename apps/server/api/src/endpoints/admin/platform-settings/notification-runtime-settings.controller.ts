import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { PlatformSettingSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import {
  Controller,
  Get,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

/** Non-secret notification presentation settings for the provider process. */
@Controller('internal/platform-runtime-settings')
@Public()
@UseGuards(AdminApiKeyGuard)
export class NotificationRuntimeSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  async get(@Req() request: Request) {
    const state = await this.settings.getFeatureSettingsState();
    if (!state.isResolved)
      throw new ServiceUnavailableException(
        'Notification settings are unavailable',
      );
    const value = state.settings;
    return serializeSingle(request, PlatformSettingSerializer, {
      id: 'platform-runtime-settings',
      imageCompressionQuality: value.imageCompressionQuality,
      discordChannelIdDeployments: value.discordChannelIdDeployments,
      discordChannelIdPosts: value.discordChannelIdPosts,
      discordChannelIdStudio: value.discordChannelIdStudio,
      discordChannelIdUsers: value.discordChannelIdUsers,
      discordChannelIdModels: value.discordChannelIdModels,
      discordBotAvatarUrl: value.discordBotAvatarUrl,
      discordWebhookNamePrefix: value.discordWebhookNamePrefix,
      discordWebhookReason: value.discordWebhookReason,
      emailFromAddress: value.emailFromAddress,
      emailReplyToAddress: value.emailReplyToAddress,
    });
  }
}
