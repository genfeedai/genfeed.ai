import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';

@Controller('dev/discord')
export class DevDiscordController {
  constructor(
    private readonly configService: ConfigService,
    private readonly discordBotService: DiscordBotService,
  ) {}

  @HttpCode(200)
  @Post('test-channel')
  testChannel(@Body() body: { channelId: string }) {
    if (this.configService.isProduction) {
      throw new HttpException('Dev only', HttpStatus.FORBIDDEN);
    }

    if (!body.channelId) {
      throw new HttpException('channelId is required', HttpStatus.BAD_REQUEST);
    }

    return this.discordBotService.testChannel(body.channelId);
  }

  @Get('channels')
  getChannels() {
    if (this.configService.isProduction) {
      throw new HttpException('Dev only', HttpStatus.FORBIDDEN);
    }

    return this.discordBotService.getAllConfiguredChannels();
  }
}
