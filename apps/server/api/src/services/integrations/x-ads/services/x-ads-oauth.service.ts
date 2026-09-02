import type {
  XAdsOAuthTokens,
  XAdsRequestCredentials,
} from '@api/services/integrations/x-ads/interfaces/x-ads.interface';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TwitterApi } from 'twitter-api-v2';

interface XAdsOAuthConfig {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
}

/**
 * X Ads three-legged OAuth 1.0a via the provider-recommended
 * `twitter-api-v2` client. The Ads application API key/secret are deliberately
 * separate from organic X's OAuth 2.0 client credentials.
 */
@Injectable()
export class XAdsOAuthService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async generateAuthLink(): Promise<{
    oauthToken: string;
    oauthTokenSecret: string;
    url: string;
  }> {
    const config = this.getConfig();
    const client = this.buildClient(config);
    const result = await client.generateAuthLink(config.redirectUri, {
      authAccessType: 'write',
      linkMode: 'authorize',
    });

    return {
      oauthToken: result.oauth_token,
      oauthTokenSecret: result.oauth_token_secret,
      url: result.url,
    };
  }

  async exchangeRequestToken(
    oauthToken: string,
    oauthTokenSecret: string,
    oauthVerifier: string,
  ): Promise<XAdsOAuthTokens> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const config = this.getConfig();
      const client = this.buildClient(config, {
        accessToken: oauthToken,
        accessTokenSecret: oauthTokenSecret,
      });
      const { accessSecret, accessToken, screenName, userId } =
        await client.login(oauthVerifier);

      return {
        accessToken,
        accessTokenSecret: accessSecret,
        screenName,
        userId,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, {
        name: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  createAdsClient(credentials: XAdsRequestCredentials): TwitterApi['ads'] {
    return this.buildClient(this.getConfig(), credentials).ads;
  }

  private buildClient(
    config: XAdsOAuthConfig,
    credentials?: XAdsRequestCredentials,
  ): TwitterApi {
    return new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecret,
      ...(credentials
        ? {
            accessSecret: credentials.accessTokenSecret,
            accessToken: credentials.accessToken,
          }
        : {}),
    });
  }

  private getConfig(): XAdsOAuthConfig {
    const apiKey = this.configService.get('X_ADS_API_KEY');
    const apiSecret = this.configService.get('X_ADS_API_SECRET');
    const redirectUri = this.configService.get('X_ADS_REDIRECT_URI');

    if (
      !apiKey ||
      !apiSecret ||
      !redirectUri ||
      isUnconfiguredSecret(apiKey) ||
      isUnconfiguredSecret(apiSecret) ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'X Ads OAuth is not configured for this deployment.',
      );
    }

    return { apiKey, apiSecret, redirectUri };
  }
}
