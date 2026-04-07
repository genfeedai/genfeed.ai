import { ConfigService } from '@api/config/config.service';
import { GoogleAdsOAuthTokens } from '@api/services/integrations/google-ads/interfaces/google-ads.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GoogleAdsOAuthService {
  private readonly GOOGLE_AUTH_URL =
    'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly SCOPE = 'https://www.googleapis.com/auth/adwords';
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  generateAuthUrl(state: string): string {
    const clientId = this.configService.get('GOOGLE_ADS_CLIENT_ID');
    const redirectUri = this.configService.get('GOOGLE_ADS_REDIRECT_URI');

    const params = new URLSearchParams({
      access_type: 'offline',
      client_id: clientId || '',
      prompt: 'consent',
      redirect_uri: redirectUri || '',
      response_type: 'code',
      scope: this.SCOPE,
      state,
    });

    return `${this.GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeAuthCodeForAccessToken(
    code: string,
  ): Promise<GoogleAdsOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const clientId = this.configService.get('GOOGLE_ADS_CLIENT_ID');
      const clientSecret = this.configService.get('GOOGLE_ADS_CLIENT_SECRET');
      const redirectUri = this.configService.get('GOOGLE_ADS_REDIRECT_URI');

      const response = await firstValueFrom(
        this.httpService.post<{
          access_token: string;
          refresh_token: string;
          expires_in: number;
          token_type: string;
        }>(this.GOOGLE_TOKEN_URL, {
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<GoogleAdsOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const clientId = this.configService.get('GOOGLE_ADS_CLIENT_ID');
      const clientSecret = this.configService.get('GOOGLE_ADS_CLIENT_SECRET');

      const response = await firstValueFrom(
        this.httpService.post<{
          access_token: string;
          expires_in: number;
          token_type: string;
        }>(this.GOOGLE_TOKEN_URL, {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        refreshToken,
        tokenType: response.data.token_type,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }
}
