import type { XAdsOAuthTokens } from '@api/services/integrations/x-ads/interfaces/x-ads.interface';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { TwitterApi, type TwitterApiOAuth2Init } from 'twitter-api-v2';

const X_ADS_OAUTH_SCOPES = ['ads.read', 'ads.write', 'offline.access'];

/**
 * X Ads OAuth 2.0 (PKCE) via the `twitter-api-v2` SDK — the same OAuth
 * provider and client library as organic X (`TwitterService`), scoped to
 * Ads Data API access. Degrades gracefully when credentials are absent,
 * mirroring `GoogleAdsOAuthService`: the integration is not provisioned in
 * cloud production, so `X_ADS_CLIENT_ID`/`X_ADS_CLIENT_SECRET` may be unset.
 */
@Injectable()
export class XAdsOAuthService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  generateAuthLink(state: string): { url: string; codeVerifier: string } {
    const client = this.buildClient();
    const redirectUri = this.getRedirectUri();

    const { url, codeVerifier } = client.generateOAuth2AuthLink(redirectUri, {
      scope: X_ADS_OAUTH_SCOPES,
      state,
    });

    return { codeVerifier, url };
  }

  async exchangeAuthCodeForAccessToken(
    code: string,
    codeVerifier: string,
  ): Promise<XAdsOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const client = this.buildClient();
      const redirectUri = this.getRedirectUri();

      const { accessToken, refreshToken, expiresIn, scope } =
        await client.loginWithOAuth2({
          code,
          codeVerifier,
          redirectUri,
        });

      return {
        accessToken,
        expiresIn,
        refreshToken: refreshToken ?? '',
        scope: Array.isArray(scope) ? scope.join(' ') : scope,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<XAdsOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const client = this.buildClient();

      const {
        accessToken,
        refreshToken: rotatedRefreshToken,
        expiresIn,
        scope,
      } = await client.refreshOAuth2Token(refreshToken);

      return {
        accessToken,
        expiresIn,
        refreshToken: rotatedRefreshToken ?? refreshToken,
        scope: Array.isArray(scope) ? scope.join(' ') : scope,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  private buildClient(): TwitterApi {
    return new TwitterApi({
      clientId: this.configService.get('X_ADS_CLIENT_ID'),
      clientSecret: this.configService.get('X_ADS_CLIENT_SECRET'),
    } as TwitterApiOAuth2Init);
  }

  private getRedirectUri(): string {
    return this.configService.get('X_ADS_REDIRECT_URI') as string;
  }
}
