import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
import type { IBotMessage, IBotPlatformAdapter } from '@genfeedai/interfaces';
import {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface SlackSlashCommand {
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  team_id: string;
}

@Injectable()
export class SlackBotAdapter implements IBotPlatformAdapter {
  private readonly constructorName: string = String(this.constructor.name);

  readonly platform = CredentialPlatform.SLACK;

  private readonly signingSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    this.signingSecret = this.configService.get('SLACK_SIGNING_SECRET');
  }

  validateSignature(
    body: Buffer | string,
    signature: string,
    timestamp?: string,
  ): boolean {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.signingSecret) {
      this.loggerService.error(`${url} SLACK_SIGNING_SECRET not configured`);
      return false;
    }

    if (!timestamp) {
      this.loggerService.warn(`${url} missing timestamp`);
      return false;
    }

    try {
      const bodyStr = typeof body === 'string' ? body : body.toString();
      const sigBasestring = `v0:${timestamp}:${bodyStr}`;

      const hmac = createHmac('sha256', this.signingSecret);
      hmac.update(sigBasestring);
      const expectedSignature = `v0=${hmac.digest('hex')}`;

      const expectedBuffer = Buffer.from(expectedSignature);
      const actualBuffer = Buffer.from(signature);

      if (expectedBuffer.length !== actualBuffer.length) {
        this.loggerService.warn(`${url} signature length mismatch`);
        return false;
      }

      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch (error: unknown) {
      this.loggerService.error(`${url} signature validation failed`, error);
      return false;
    }
  }

  getInteractionType(body: unknown): BotInteractionType | null {
    const payload = body as Record<string, unknown>;

    // URL verification challenge
    if (payload?.type === 'url_verification') {
      return BotInteractionType.PING;
    }

    // Slash command (has 'command' field)
    if (payload?.command) {
      return BotInteractionType.APPLICATION_COMMAND;
    }

    return null;
  }

  parseMessage(body: unknown): IBotMessage | null {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const command = body as SlackSlashCommand;
    if (!command.command) {
      this.loggerService.warn(`${url} not a slash command`);
      return null;
    }

    const commandMap: Record<string, BotCommandType> = {
      '/prompt-image': BotCommandType.PROMPT_IMAGE,
      '/prompt-video': BotCommandType.PROMPT_VIDEO,
      '/set-brand': BotCommandType.SET_BRAND,
      '/status': BotCommandType.STATUS,
    };

    const botCommand = commandMap[command.command];
    if (!botCommand) {
      this.loggerService.warn(`${url} unknown command: ${command.command}`);
      return null;
    }

    this.loggerService.log(`${url} parsed command`, {
      command: botCommand,
      platformUserId: command.user_id,
    });

    return {
      applicationId: command.team_id,
      brandName:
        botCommand === BotCommandType.SET_BRAND ? command.text : undefined,
      chatId: command.channel_id,
      command: botCommand,
      interactionToken: command.response_url,
      platform: this.platform,
      platformUserId: command.user_id,
      prompt:
        botCommand === BotCommandType.PROMPT_IMAGE ||
        botCommand === BotCommandType.PROMPT_VIDEO
          ? command.text
          : undefined,
      rawPayload: command,
    };
  }

  buildImmediateResponse(
    type: BotResponseType,
    message?: string,
  ): Record<string, unknown> {
    if (type === BotResponseType.PONG) {
      return { type: BotResponseType.PONG };
    }

    if (type === BotResponseType.DEFERRED_CHANNEL_MESSAGE) {
      return {
        response_type: 'in_channel',
        text: 'Processing your request...',
      };
    }

    return {
      blocks: [
        {
          text: {
            text: message || '',
            type: 'mrkdwn',
          },
          type: 'section',
        },
      ],
      response_type: 'in_channel',
      text: message || '',
    };
  }

  async sendFollowupMessage(
    _applicationId: string,
    responseUrl: string,
    message: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      await firstValueFrom(
        this.httpService.post(
          responseUrl,
          {
            response_type: 'in_channel',
            text: message,
          },
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      this.loggerService.log(`${url} sent followup message`);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send followup`, error);
      throw error;
    }
  }

  async sendFollowupMedia(
    _applicationId: string,
    responseUrl: string,
    mediaUrl: string,
    type: 'image' | 'video',
    caption?: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const blocks: Record<string, unknown>[] = [];

      if (caption) {
        blocks.push({
          text: { text: caption, type: 'mrkdwn' },
          type: 'section',
        });
      }

      if (type === 'image') {
        blocks.push({
          alt_text: caption || 'Generated image',
          image_url: mediaUrl,
          type: 'image',
        });
      } else {
        blocks.push({
          text: {
            text: `<${mediaUrl}|View generated video>`,
            type: 'mrkdwn',
          },
          type: 'section',
        });
      }

      await firstValueFrom(
        this.httpService.post(
          responseUrl,
          {
            blocks,
            response_type: 'in_channel',
            text: caption || `Generated ${type}`,
          },
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      this.loggerService.log(`${url} sent followup media`, { type });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send media followup`, error);
      throw error;
    }
  }
}
