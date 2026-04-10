import { API_ENDPOINTS } from '@genfeedai/constants';
import { deserializeResource } from '@genfeedai/helpers/data/json-api/json-api.helper';
import { Bot } from '@genfeedai/models/automation/bot.model';
import { LivestreamSession } from '@genfeedai/models/automation/livestream-session.model';
import { BotSerializer } from '@genfeedai/serializers';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

export class BotsService extends BaseService<Bot> {
  constructor(token: string) {
    super(API_ENDPOINTS.BOTS, token, Bot, BotSerializer);
  }

  public static getInstance(token: string): BotsService {
    return BaseService.getDataServiceInstance(
      BotsService,
      token,
    ) as BotsService;
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
    return this.postLivestreamSession(`${botId}/livestream-session/start`, {});
  }

  async stopLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.postLivestreamSession(`${botId}/livestream-session/stop`, {});
  }

  async pauseLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.postLivestreamSession(`${botId}/livestream-session/pause`, {});
  }

  async resumeLivestreamSession(botId: string): Promise<LivestreamSession> {
    return this.postLivestreamSession(`${botId}/livestream-session/resume`, {});
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
}
