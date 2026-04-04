import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { GenFeedService } from '@notifications/services/genfeed/genfeed.service';
import axios from 'axios';

@Injectable()
export class ChatBotService {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly genFeedService: GenFeedService,
  ) {}

  public async generateResponse(prompt: string): Promise<string> {
    const url = `${this.constructor.name} generateResponse`;
    try {
      const text = await this.genFeedService.generateResponse({
        prompt,
        type: 'chat',
      });

      this.loggerService.log(`${url} completed`, { textLength: text.length });

      return text;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async sendToTwitchChat(
    token: string,
    broadcasterId: string,
    message: string,
    senderId?: string,
  ): Promise<void> {
    const url = `${this.constructor.name} sendToTwitchChat`;
    try {
      const params = new URLSearchParams({
        broadcaster_id: broadcasterId,
        sender_id: senderId || broadcasterId,
      });

      await axios.post(
        `https://api.twitch.tv/helix/chat/messages?${params.toString()}`,
        {
          message,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Client-Id': this.configService.get('TWITCH_CLIENT_ID') || '',
            'Content-Type': 'application/json',
          },
        },
      );
      this.loggerService.log(`${url} completed`, { broadcasterId });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async sendToYouTubeChat(
    token: string,
    liveChatId: string,
    message: string,
  ): Promise<void> {
    const url = `${this.constructor.name} sendToYouTubeChat`;
    try {
      await axios.post(
        'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
        {
          snippet: {
            liveChatId,
            textMessageDetails: { messageText: message },
            type: 'textMessageEvent',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      this.loggerService.log(`${url} completed`, { liveChatId });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async handleChat(
    platform: 'twitch' | 'youtube',
    token: string,
    channelId: string,
    prompt: string,
  ): Promise<void> {
    const response = await this.generateResponse(prompt);
    if (platform === 'twitch') {
      await this.sendToTwitchChat(token, channelId, response);
    } else {
      await this.sendToYouTubeChat(token, channelId, response);
    }
  }
}
