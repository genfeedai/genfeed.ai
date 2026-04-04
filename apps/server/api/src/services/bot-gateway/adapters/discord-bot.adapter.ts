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

interface DiscordInteraction {
  id: string;
  type: number;
  token: string;
  application_id: string;
  user?: {
    id: string;
    username: string;
  };
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  channel_id: string;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      value: string;
    }>;
  };
}

@Injectable()
export class DiscordBotAdapter implements IBotPlatformAdapter {
  private readonly constructorName: string = String(this.constructor.name);

  readonly platform = CredentialPlatform.DISCORD;

  private readonly discordApiUrl = 'https://discord.com/api/v10';

  private readonly publicKey: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    this.publicKey = this.configService.get('DISCORD_PUBLIC_KEY');
  }

  /**
   * Validate Discord request signature using Ed25519
   */
  validateSignature(
    body: Buffer | string,
    signature: string,
    timestamp?: string,
  ): boolean {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.publicKey) {
      this.loggerService.error(`${url} DISCORD_PUBLIC_KEY not configured`);
      return false;
    }

    if (!timestamp) {
      this.loggerService.warn(`${url} missing timestamp`);
      return false;
    }

    try {
      const message =
        timestamp + (typeof body === 'string' ? body : body.toString());

      // Convert hex public key to buffer
      const publicKeyBuffer = Buffer.from(this.publicKey, 'hex');

      // For Ed25519, we need to use the 'ed25519' algorithm
      const isValid = this.verifyEd25519(message, signature, publicKeyBuffer);

      if (!isValid) {
        this.loggerService.warn(`${url} invalid signature`);
      }

      return isValid;
    } catch (error: unknown) {
      this.loggerService.error(`${url} signature validation failed`, error);
      return false;
    }
  }

  /**
   * Verify Ed25519 signature
   */
  private verifyEd25519(
    message: string,
    signature: string,
    publicKey: Buffer,
  ): boolean {
    try {
      // Import the ed25519 verification using crypto
      const { verify } = require('node:crypto');
      const signatureBuffer = Buffer.from(signature, 'hex');

      // Create the key object for Ed25519
      const keyObject = {
        format: 'der' as const,
        key: Buffer.concat([
          // Ed25519 public key prefix for DER format
          Buffer.from('302a300506032b6570032100', 'hex'),
          publicKey,
        ]),
        type: 'spki' as const,
      };

      return verify(
        null, // Ed25519 doesn't need a hash algorithm
        Buffer.from(message),
        keyObject,
        signatureBuffer,
      );
    } catch (error: unknown) {
      this.loggerService.error('Ed25519 verification error', error);
      return false;
    }
  }

  /**
   * Get the interaction type from Discord payload
   */
  getInteractionType(body: unknown): BotInteractionType | null {
    const interaction = body as DiscordInteraction;
    if (!interaction || typeof interaction.type !== 'number') {
      return null;
    }
    return interaction.type as BotInteractionType;
  }

  /**
   * Parse Discord interaction into normalized BotMessage
   */
  parseMessage(body: unknown): IBotMessage | null {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const interaction = body as DiscordInteraction;

    // Only handle application commands
    if (interaction.type !== BotInteractionType.APPLICATION_COMMAND) {
      return null;
    }

    const commandName = interaction.data?.name;
    if (!commandName) {
      this.loggerService.warn(`${url} no command name in interaction`);
      return null;
    }

    // Map Discord command names to BotCommandType
    const commandMap: Record<string, BotCommandType> = {
      'prompt-image': BotCommandType.PROMPT_IMAGE,
      'prompt-video': BotCommandType.PROMPT_VIDEO,
      'set-brand': BotCommandType.SET_BRAND,
      status: BotCommandType.STATUS,
    };

    const command = commandMap[commandName];
    if (!command) {
      this.loggerService.warn(`${url} unknown command: ${commandName}`);
      return null;
    }

    // Get user ID (from DM or guild)
    const platformUserId = interaction.user?.id || interaction.member?.user?.id;
    if (!platformUserId) {
      this.loggerService.warn(`${url} no user ID in interaction`);
      return null;
    }

    // Extract options
    const options = interaction.data?.options || [];
    const promptOption = options.find((opt) => opt.name === 'prompt');
    const brandOption = options.find((opt) => opt.name === 'brand');

    this.loggerService.log(`${url} parsed command`, {
      command,
      hasPrompt: !!promptOption,
      platformUserId,
    });

    return {
      applicationId: interaction.application_id,
      brandName: brandOption?.value,
      chatId: interaction.channel_id,
      command,
      interactionId: interaction.id,
      interactionToken: interaction.token,
      platform: this.platform,
      platformUserId,
      prompt: promptOption?.value,
      rawPayload: interaction,
    };
  }

  /**
   * Build immediate response for Discord interaction
   */
  buildImmediateResponse(
    type: BotResponseType,
    message?: string,
  ): Record<string, unknown> {
    if (type === BotResponseType.PONG) {
      return { type: BotResponseType.PONG };
    }

    if (type === BotResponseType.DEFERRED_CHANNEL_MESSAGE) {
      return { type: BotResponseType.DEFERRED_CHANNEL_MESSAGE };
    }

    return {
      data: {
        content: message || '',
      },
      type: BotResponseType.CHANNEL_MESSAGE,
    };
  }

  /**
   * Send follow-up message after deferred response
   */
  async sendFollowupMessage(
    applicationId: string,
    interactionToken: string,
    message: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const webhookUrl = `${this.discordApiUrl}/webhooks/${applicationId}/${interactionToken}`;

      await firstValueFrom(
        this.httpService.post(
          webhookUrl,
          { content: message },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} sent followup message`);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send followup`, error);
      throw error;
    }
  }

  /**
   * Send media as follow-up with embed
   */
  async sendFollowupMedia(
    applicationId: string,
    interactionToken: string,
    mediaUrl: string,
    type: 'image' | 'video',
    caption?: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const webhookUrl = `${this.discordApiUrl}/webhooks/${applicationId}/${interactionToken}`;

      const payload: Record<string, unknown> = {
        content: caption || '',
      };

      if (type === 'image') {
        payload.embeds = [
          {
            image: { url: mediaUrl },
          },
        ];
      } else {
        // For video, just send the URL - Discord will embed it
        payload.content = `${caption || ''}\n${mediaUrl}`;
      }

      await firstValueFrom(
        this.httpService.post(webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );

      this.loggerService.log(`${url} sent followup media`, { type });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to send media followup`, error);
      throw error;
    }
  }
}
