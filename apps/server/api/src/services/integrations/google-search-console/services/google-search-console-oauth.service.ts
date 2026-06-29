import { ConfigService } from '@api/config/config.service';
import type { GoogleSearchConsoleOAuthTokens } from '@api/services/integrations/google-search-console/interfaces/google-search-console.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GoogleSearchConsoleOAuthService {
  private readonly GOOGLE_AUTH_URL =
    'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly SCOPE =
    'https://www.googleapis.com/auth/webmasters.readonly';
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {}

  generateAuthUrl(state: string): string {
    const clientId = this.configService.get('GOOGLE_SEARCH_CONSOLE_CLIENT_ID');
    const redirectUri = this.configService.get(
      'GOOGLE_SEARCH_CONSOLE_REDIRECT_URI',
    );

    const params = new URLSearchParams({
      access_type: 'offline',
      client_id: clientId || '',
      include_granted_scopes: 'true',
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
  ): Promise<GoogleSearchConsoleOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          access_token: string;
          expires_in?: number;
          refresh_token?: string;
          token_type?: string;
        }>(this.GOOGLE_TOKEN_URL, {
          client_id: this.configService.get('GOOGLE_SEARCH_CONSOLE_CLIENT_ID'),
          client_secret: this.configService.get(
            'GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET',
          ),
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.configService.get(
            'GOOGLE_SEARCH_CONSOLE_REDIRECT_URI',
          ),
        }),
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type,
      };
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${caller} failed: ${message}${status ? ` (HTTP ${status})` : ''}`,
      );
      throw error;
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<GoogleSearchConsoleOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          access_token: string;
          expires_in?: number;
          token_type?: string;
        }>(this.GOOGLE_TOKEN_URL, {
          client_id: this.configService.get('GOOGLE_SEARCH_CONSOLE_CLIENT_ID'),
          client_secret: this.configService.get(
            'GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET',
          ),
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
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.loggerService.error(
        `${caller} failed: ${message}${status ? ` (HTTP ${status})` : ''}`,
      );
      throw error;
    }
  }
}
