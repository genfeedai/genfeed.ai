import { API_ENDPOINTS } from '@genfeedai/constants';
import { Bot } from '@genfeedai/models/automation/bot.model';
import { LivestreamSession } from '@genfeedai/models/automation/livestream-session.model';
import { BotSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import { deserializeResource } from '@services/core/json-api';

export class BotsService extends BaseService<Bot> {
  constructor(token: string) {
    super(API_ENDPOINTS.BOTS, token, Bot, BotSerializer);
  }

  public static getInstance(token: string): BotsService {
    return BaseService.getDataServiceInstance(BotsService, token);
  }

  async findAllByOrganization(organizationId: string): Promise<Bot[]> {
    return this.findAll({
      organization: organizationId,
      pagination: false,
      scope: 'organization',
    });
  }

  async findAllByAccount(brandId: string): Promise<Bot[]> {
    return this.findAll({
      brand: brandId,
      pagination: false,
      scope: 'brand',
    });
  }

  async findAllByUser(userId: string): Promise<Bot[]> {
    return this.findAll({
      pagination: false,
      scope: 'user',
      user: userId,
    });
  }

  async getLivestreamSession(botId: string): Promise<LivestreamSession> {
    const response = await this.instance.get<JsonApiResponseDocument>(
      `/${botId}/livestream-session`,
    );
    return new LivestreamSession(deserializeResource(response.data));
  }

  async startLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.patchLivestreamSession(botId, 'active');
  }

  async stopLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.patchLivestreamSession(botId, 'stopped');
  }

  async pauseLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.patchLivestreamSession(botId, 'paused');
  }

  async resumeLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.patchLivestreamSession(botId, 'active');
  }

  async ingestTranscriptChunk(
    botId: string,
    payload: {
      audioUrl?: string;
      confidence?: number;
      text?: string;
    },
  ): Promise<LivestreamSession> {
    return this.postLivestreamSession(
      `${botId}/livestream-session/transcript`,
      payload,
    );
  }

  async setLivestreamOverride(
    botId: string,
    payload: {
      activeLinkId?: string;
      promotionAngle?: string;
      topic?: string;
    },
  ): Promise<LivestreamSession> {
    return this.postLivestreamSession(
      `${botId}/livestream-session/override`,
      payload,
    );
  }

  async sendLivestreamMessageNow(
    botId: string,
    payload: {
      message?: string;
      platform: 'twitch' | 'youtube';
      type?:
        | 'scheduled_link_drop'
        | 'scheduled_host_prompt'
        | 'context_aware_question';
    },
  ): Promise<LivestreamSession> {
    return this.postLivestreamSession(
      `${botId}/livestream-session/send-now`,
      payload,
    );
  }

  private async postLivestreamSession(
    path: string,
    body: Record<string, string | number | boolean | undefined>,
  ): Promise<LivestreamSession> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${path}`,
      body,
    );

    return new LivestreamSession(deserializeResource(response.data));
  }

  private async patchLivestreamSession(
    botId: string,
    status: 'active' | 'paused' | 'stopped',
  ): Promise<LivestreamSession> {
    const response = await this.instance.patch<JsonApiResponseDocument>(
      `/${botId}/livestream-session`,
      { status },
    );

    return new LivestreamSession(deserializeResource(response.data));
  }
}
