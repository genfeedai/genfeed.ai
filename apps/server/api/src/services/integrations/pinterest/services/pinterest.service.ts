import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PinterestService {
  private readonly constructorName = String(this.constructor.name);
  private readonly baseUrl = 'https://api.pinterest.com/v5';

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  public generateAuthUrl(
    state: string,
    scopes: string[] = ['pins:read', 'pins:write'],
  ): string {
    const clientId = this.configService.get('PINTEREST_CLIENT_ID');
    const redirectUri = this.configService.get('PINTEREST_REDIRECT_URI');
    const scope = scopes.join(',');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      state,
    } as Record<string, string>);
    return `https://www.pinterest.com/oauth/?${params.toString()}`;
  }

  public async exchangeCodeForToken(
    code: string,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const clientId = this.configService.get('PINTEREST_CLIENT_ID');
      const clientSecret = this.configService.get('PINTEREST_CLIENT_SECRET');
      const redirectUri = this.configService.get('PINTEREST_REDIRECT_URI');

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/oauth/token`,
          {
            code,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: redirectUri,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, response.data);
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.PINTEREST,
      });

      if (!credential?.refreshToken) {
        throw new Error(
          'Pinterest credential not found or missing refresh token',
        );
      }

      // Decrypt the refresh token before use
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credential.refreshToken,
      );

      const clientId = this.configService.get('PINTEREST_CLIENT_ID');
      const clientSecret = this.configService.get('PINTEREST_CLIENT_SECRET');

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/oauth/token`,
          {
            grant_type: OAuthGrantType.REFRESH_TOKEN,
            refresh_token: decryptedRefreshToken,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
          },
        ),
      );

      const { access_token, refresh_token, expires_in } = response.data;

      this.loggerService.log(`${url} success`, {
        credentialId: credential.id,
        hasNewRefreshToken: !!refresh_token,
      });

      return this.credentialsService.patch(credential.id, {
        accessToken: access_token,
        accessTokenExpiry: expires_in
          ? new Date(Date.now() + expires_in * 1000)
          : undefined,
        isConnected: true,
        isDeleted: false,
        refreshToken: refresh_token || credential.refreshToken,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async createPin(
    accessToken: string,
    boardId: string,
    imageUrl: string,
    title: string,
    description?: string,
    link?: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/pins`,
          {
            board_id: boardId,
            description,
            link,
            media_source: { source_type: 'image_url', url: imageUrl },
            title,
          },
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, response.data);
      return response.data.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getPinAnalytics(
    accessToken: string,
    pinId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/pins/${pinId}/analytics`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { metric_types: 'IMPRESSION,CLICK,SAVE' },
        }),
      );

      this.loggerService.log(`${url} success`, response.data);
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    externalId: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    saves?: number;
    clicks?: number;
    impressions?: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        organization: organizationId,
        platform: CredentialPlatform.PINTEREST,
      });

      if (!credential?.accessToken) {
        throw new Error('Pinterest credential not found');
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const analytics = await this.getPinAnalytics(
        decryptedAccessToken,
        externalId,
      );

      const impressions = this.readPinterestMetric(analytics, [
        'IMPRESSION',
        'IMPRESSIONS',
      ]);
      const saves = this.readPinterestMetric(analytics, ['SAVE', 'SAVES']);
      const pinClicks = this.readPinterestMetric(analytics, [
        'PIN_CLICK',
        'PIN_CLICKS',
        'CLICK',
        'CLICKS',
      ]);
      const outboundClicks = this.readPinterestMetric(analytics, [
        'OUTBOUND_CLICK',
        'OUTBOUND_CLICKS',
      ]);

      if (
        !impressions.found &&
        !saves.found &&
        !pinClicks.found &&
        !outboundClicks.found
      ) {
        throw new Error('Pinterest analytics returned no metric values');
      }

      return {
        clicks: pinClicks.value + outboundClicks.value,
        comments: 0,
        impressions: impressions.value,
        likes: 0,
        saves: saves.value,
        views: impressions.value,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        brandId,
        error,
        externalId,
        organizationId,
      });
      throw error;
    }
  }

  private readPinterestMetric(
    source: unknown,
    aliases: string[],
  ): { found: boolean; value: number } {
    const normalizedAliases = new Set(
      aliases.map((alias) => this.normalizeMetricName(alias)),
    );
    const queue: unknown[] = [source];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') {
        continue;
      }

      for (const [key, value] of Object.entries(
        current as Record<string, unknown>,
      )) {
        if (normalizedAliases.has(this.normalizeMetricName(key))) {
          const metricValue = this.readMetricNumber(value);
          if (metricValue !== null) {
            return { found: true, value: metricValue };
          }
        }

        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return { found: false, value: 0 };
  }

  private readMetricNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    return (
      this.readMetricNumber(record.value) ??
      this.readMetricNumber(record.total) ??
      this.readMetricNumber(record.count)
    );
  }

  private normalizeMetricName(value: string): string {
    return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  public async searchPins(
    accessToken: string,
    query: string,
  ): Promise<unknown[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/search/pins`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { query },
        }),
      );

      this.loggerService.log(`${url} success`, response.data);
      return response.data.items || response.data.data || [];
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
