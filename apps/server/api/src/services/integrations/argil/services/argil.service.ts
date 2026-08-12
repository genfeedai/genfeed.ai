import { ByokService } from '@api/services/byok/byok.service';
import { ArgilWebhookTokenService } from '@api/services/integrations/argil/services/argil-webhook-token.service';
import { isProviderWebhookReachable } from '@genfeedai/config';
import { ByokProvider } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type ArgilRecord = Record<string, unknown>;

export type ArgilAspectRatio = '16:9' | '9:16';
export type ArgilVideoState =
  | 'IDLE'
  | 'GENERATING_AUDIO'
  | 'GENERATING_VIDEO'
  | 'DONE'
  | 'FAILED';

export interface ArgilCatalogItem {
  id: string;
  name: string;
  previewUrl?: string;
}

export interface ArgilVideoStatus {
  error?: string;
  id: string;
  status: ArgilVideoState;
  videoUrl?: string;
}

export interface GenerateArgilVideoInput {
  aspectRatio?: ArgilAspectRatio;
  avatarId: string;
  callbackId: string;
  organizationId: string;
  onVideoCreated?: (videoId: string) => Promise<void>;
  script: string;
  voiceId: string;
}

@Injectable()
export class ArgilService {
  private readonly endpoint = 'https://api.argil.ai/v1';

  constructor(
    private readonly byokService: ByokService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly webhookTokenService: ArgilWebhookTokenService,
  ) {}

  async generateAvatarVideo(input: GenerateArgilVideoInput): Promise<string> {
    const apiKey = await this.resolveApiKey(input.organizationId);
    const response = await firstValueFrom(
      this.httpService.post<unknown>(
        `${this.endpoint}/videos`,
        {
          aspectRatio: input.aspectRatio ?? '9:16',
          extras: { callbackId: input.callbackId },
          model: 'ARGIL_ATOM',
          moments: [
            {
              avatarId: input.avatarId,
              transcript: input.script,
              voiceId: input.voiceId,
            },
          ],
          name: `Genfeed clip ${input.callbackId}`,
        },
        { headers: this.getHeaders(apiKey), timeout: 15_000 },
      ),
    );

    const videoId = this.readIdentifier(response.data);
    if (!videoId) {
      throw new Error('Argil did not return a video ID');
    }

    await input.onVideoCreated?.(videoId);

    const callbackUrl = this.buildCallbackUrl(videoId);
    if (!callbackUrl) {
      throw new Error(
        'Argil rendering requires an HTTPS webhook URL and ARGIL_WEBHOOK_SECRET',
      );
    }

    await firstValueFrom(
      this.httpService.post(
        `${this.endpoint}/videos/${encodeURIComponent(videoId)}/render`,
        { callbackUrl },
        { headers: this.getHeaders(apiKey), timeout: 15_000 },
      ),
    );

    this.loggerService.log('ArgilService video render started', {
      callbackConfigured: Boolean(callbackUrl),
      videoId,
    });
    return videoId;
  }

  async getAvatars(organizationId: string): Promise<ArgilCatalogItem[]> {
    return this.getCatalog('/avatars', organizationId, 'avatars');
  }

  async getVoices(organizationId: string): Promise<ArgilCatalogItem[]> {
    return this.getCatalog('/voices', organizationId, 'voices');
  }

  async getVideoStatus(
    videoId: string,
    organizationId: string,
  ): Promise<ArgilVideoStatus> {
    const apiKey = await this.resolveApiKey(organizationId);
    const response = await firstValueFrom(
      this.httpService.get<unknown>(
        `${this.endpoint}/videos/${encodeURIComponent(videoId)}`,
        { headers: this.getHeaders(apiKey), timeout: 15_000 },
      ),
    );
    const record = this.unwrapRecord(response.data);
    const status = this.readState(record.status);

    return {
      error: this.readString(record.error) ?? this.readString(record.message),
      id: this.readString(record.id) ?? videoId,
      status,
      videoUrl:
        this.readString(record.videoUrl) ??
        this.readString(record.video_url) ??
        this.readString(record.url),
    };
  }

  private async getCatalog(
    path: string,
    organizationId: string,
    collectionKey: string,
  ): Promise<ArgilCatalogItem[]> {
    const apiKey = await this.resolveApiKey(organizationId);
    const response = await firstValueFrom(
      this.httpService.get<unknown>(`${this.endpoint}${path}`, {
        headers: this.getHeaders(apiKey),
        timeout: 15_000,
      }),
    );
    const items = this.readCollection(response.data, collectionKey);

    return items.flatMap((item) => {
      const id =
        this.readString(item.id) ??
        this.readString(item.avatarId) ??
        this.readString(item.voiceId);
      if (!id) {
        return [];
      }

      return [
        {
          id,
          name: this.readString(item.name) ?? id,
          previewUrl:
            this.readString(item.previewUrl) ??
            this.readString(item.preview) ??
            this.readString(item.audioUrl) ??
            this.readString(item.thumbnailUrl),
        },
      ];
    });
  }

  private async resolveApiKey(organizationId: string): Promise<string> {
    const byok = await this.byokService.resolveApiKey(
      organizationId,
      ByokProvider.ARGIL,
    );
    const configuredApiKey = this.configService.get('ARGIL_KEY');
    const apiKey =
      byok?.apiKey ??
      (typeof configuredApiKey === 'string' ? configuredApiKey : undefined);
    if (!apiKey) {
      throw new Error('No Argil API key configured (BYOK or env ARGIL_KEY)');
    }
    return apiKey;
  }

  private getHeaders(apiKey: string): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-api-key': apiKey };
  }

  private buildCallbackUrl(videoId: string): string | undefined {
    const configuredBaseUrl = this.configService.get('GENFEEDAI_WEBHOOKS_URL');
    const baseUrl =
      typeof configuredBaseUrl === 'string' ? configuredBaseUrl : undefined;
    const token = this.webhookTokenService.create(videoId);
    if (!token || !isProviderWebhookReachable(baseUrl)) {
      return undefined;
    }

    const callbackUrl = new URL('/v1/webhooks/argil/callback', baseUrl);
    if (callbackUrl.protocol !== 'https:') {
      return undefined;
    }

    callbackUrl.searchParams.set('token', token);
    return callbackUrl.toString();
  }

  private readCollection(value: unknown, collectionKey: string): ArgilRecord[] {
    if (Array.isArray(value)) {
      return value.filter(this.isRecord);
    }
    if (this.isRecord(value) && Array.isArray(value.data)) {
      return value.data.filter(this.isRecord);
    }
    const record = this.unwrapRecord(value);
    const collection = record[collectionKey];
    return Array.isArray(collection) ? collection.filter(this.isRecord) : [];
  }

  private readIdentifier(value: unknown): string | undefined {
    const record = this.unwrapRecord(value);
    return this.readString(record.id) ?? this.readString(record.videoId);
  }

  private unwrapRecord(value: unknown): ArgilRecord {
    if (!this.isRecord(value)) {
      return {};
    }
    return this.isRecord(value.data) ? value.data : value;
  }

  private readonly isRecord = (value: unknown): value is ArgilRecord =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readState(value: unknown): ArgilVideoState {
    if (
      value === 'IDLE' ||
      value === 'GENERATING_AUDIO' ||
      value === 'GENERATING_VIDEO' ||
      value === 'DONE' ||
      value === 'FAILED'
    ) {
      return value;
    }
    return 'GENERATING_VIDEO';
  }
}
