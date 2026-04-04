import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { WebClient } from '@slack/web-api';

@Injectable()
export class SlackService {
  private readonly context = { service: SlackService.name };
  private client: WebClient | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.initClient();
  }

  private initClient(): void {
    const token = this.configService.get('SLACK_NOTIFICATION_BOT_TOKEN');

    if (!token) {
      this.loggerService.log(
        'Slack notification bot not configured - skipping initialization',
        this.context,
      );
      return;
    }

    try {
      this.client = new WebClient(token);
      this.loggerService.log(
        'Slack notification client initialized',
        this.context,
      );
    } catch (error: unknown) {
      this.loggerService.error(
        'Failed to initialize Slack client',
        error,
        this.context,
      );
    }
  }

  public async sendMessage(
    channelId: string,
    text: string,
    blocks?: Record<string, unknown>[],
  ): Promise<void> {
    const url = `${SlackService.name} ${CallerUtil.getCallerName()}`;

    if (!this.client) {
      this.loggerService.warn(`${url} Client not initialized`, this.context);
      return;
    }

    try {
      await this.client.chat.postMessage({
        blocks: blocks as unknown[],
        channel: channelId,
        text,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} Failed to send message to ${channelId}`,
        error,
        this.context,
      );
    }
  }

  public async sendFile(
    channelId: string,
    fileUrl: string,
    comment?: string,
  ): Promise<void> {
    const url = `${SlackService.name} ${CallerUtil.getCallerName()}`;

    if (!this.client) {
      this.loggerService.warn(`${url} Client not initialized`, this.context);
      return;
    }

    try {
      // Send the file URL as a message with an image block
      const blocks: Record<string, unknown>[] = [];

      if (comment) {
        blocks.push({
          text: { text: comment, type: 'mrkdwn' },
          type: 'section',
        });
      }

      blocks.push({
        alt_text: comment || 'Shared file',
        image_url: fileUrl,
        type: 'image',
      });

      await this.client.chat.postMessage({
        blocks: blocks as unknown[],
        channel: channelId,
        text: comment || 'Shared file',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} Failed to send file to ${channelId}`,
        error,
        this.context,
      );
    }
  }
}
