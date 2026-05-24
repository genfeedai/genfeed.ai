import type {
  BotDocument,
  BotTarget,
} from '@api/collections/bots/schemas/bot.schema';
import type { CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { ConfigService } from '@api/config/config.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { google } from 'googleapis';

function requireString(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new Error(`Livestream credential is missing ${field}`);
  }

  return value;
}

@Injectable()
export class BotsLivestreamDeliveryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async deliverMessage(
    bot: BotDocument,
    target: BotTarget,
    message: string,
  ): Promise<{ resolvedTargetId?: string }> {
    const credential = await this.resolveCredential(bot, target);

    if (target.platform === 'youtube') {
      const liveChatId = await this.resolveYoutubeLiveChatId(
        target,
        credential,
      );
      await this.sendToYoutubeLiveChat(
        requireString(credential.accessToken, 'accessToken'),
        liveChatId,
        message,
      );
      return { resolvedTargetId: liveChatId };
    }

    const broadcasterId = target.channelId || credential.externalId;

    if (!broadcasterId) {
      throw new Error('Twitch target is missing broadcaster ID');
    }

    await this.sendToTwitchChat(
      requireString(credential.accessToken, 'accessToken'),
      broadcasterId,
      message,
      target.senderId || credential.externalId || undefined,
    );

    return { resolvedTargetId: broadcasterId };
  }

  private async resolveCredential(
    bot: BotDocument,
    target: BotTarget,
  ): Promise<CredentialDocument> {
    const credentialId = target.credentialId?.toString();

    if (!credentialId) {
      throw new Error(`No credential configured for ${target.platform} target`);
    }

    const organizationId =
      typeof bot.organization === 'string'
        ? bot.organization
        : String(bot.organization);

    const credential = await this.prisma.credential.findFirst({
      where: {
        id: credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId,
      },
    });

    if (!credential) {
      throw new Error(
        `Credential ${credentialId} not found for livestream target`,
      );
    }

    return credential as unknown as CredentialDocument;
  }

  private async resolveYoutubeLiveChatId(
    target: BotTarget,
    credential: CredentialDocument,
  ): Promise<string> {
    if (target.liveChatId) {
      return target.liveChatId;
    }

    const auth = new google.auth.OAuth2(
      this.getConfigValue('YOUTUBE_CLIENT_ID'),
      this.getConfigValue('YOUTUBE_CLIENT_SECRET'),
      this.getConfigValue('YOUTUBE_REDIRECT_URI'),
    );
    auth.setCredentials({
      access_token: requireString(credential.accessToken, 'accessToken'),
      refresh_token: credential.refreshToken || undefined,
    });

    const youtube = google.youtube({
      auth,
      version: 'v3',
    });

    const broadcasts = await youtube.liveBroadcasts.list({
      broadcastStatus: 'active',
      mine: true,
      part: ['snippet', 'status'],
    });

    const activeBroadcast = broadcasts.data.items?.find(
      (broadcast) => broadcast.snippet?.liveChatId,
    );

    const liveChatId = activeBroadcast?.snippet?.liveChatId;

    if (!liveChatId) {
      throw new Error('No active YouTube live chat could be resolved');
    }

    return liveChatId;
  }

  private async sendToYoutubeLiveChat(
    token: string,
    liveChatId: string,
    message: string,
  ): Promise<void> {
    await axios.post(
      'https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet',
      {
        snippet: {
          liveChatId,
          textMessageDetails: {
            messageText: message,
          },
          type: 'textMessageEvent',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  }

  private async sendToTwitchChat(
    token: string,
    broadcasterId: string,
    message: string,
    senderId?: string,
  ): Promise<void> {
    const twitchClientId = this.getConfigValue('TWITCH_CLIENT_ID');

    if (!twitchClientId) {
      throw new Error('TWITCH_CLIENT_ID is not configured');
    }

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
          'Client-Id': twitchClientId,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  private getConfigValue(key: string): string | undefined {
    const value = (
      this.configService as ConfigService & {
        get: (configKey: string) => string | number | boolean | undefined;
      }
    ).get(key);

    return typeof value === 'string' ? value : undefined;
  }
}
