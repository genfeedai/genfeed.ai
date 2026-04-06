import { createHash, randomBytes } from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { ByokProvider } from '@genfeedai/enums';
import type { IByokKeyEntry } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/**
 * OpenAI Codex OAuth client ID — public client, openly used by
 * OpenClaw, OpenCode, Roo Code, and other third-party tools.
 * OpenAI has explicitly permitted third-party use via the
 * chatgptAuthTokens mode in the Codex App Server.
 */
const OPENAI_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';

interface OAuthState {
  codeVerifier: string;
  organizationId: string;
  userId: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class OpenAiOAuthService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Generate a PKCE code verifier (43-128 chars, URL-safe).
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Derive the S256 code challenge from a code verifier.
   */
  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Encrypt the PKCE state payload so it can be passed through the OAuth redirect.
   */
  private encryptState(state: OAuthState): string {
    return EncryptionUtil.encrypt(JSON.stringify(state));
  }

  /**
   * Decrypt the PKCE state payload from the OAuth callback.
   */
  private decryptState(encrypted: string): OAuthState {
    return JSON.parse(EncryptionUtil.decrypt(encrypted));
  }

  private getRedirectUri(): string {
    const redirectUri = this.configService.get('OPENAI_CODEX_REDIRECT_URI');

    if (!redirectUri) {
      const appUrl = this.configService.get('GENFEEDAI_APP_URL');
      return `${appUrl}/oauth/openai`;
    }

    return redirectUri;
  }

  /**
   * Generate the OAuth authorization URL for OpenAI Codex.
   * Returns the URL to redirect the user to, and encrypts the PKCE state.
   */
  generateAuthUrl(organizationId: string, userId: string): string {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = this.encryptState({ codeVerifier, organizationId, userId });
    const redirectUri = this.getRedirectUri();

    const params = new URLSearchParams({
      client_id: OPENAI_CODEX_CLIENT_ID,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });

    return `${OPENAI_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for access + refresh tokens.
   * Returns the decrypted state (org/user IDs) and the token response.
   */
  async exchangeCodeForTokens(
    code: string,
    encryptedState: string,
  ): Promise<{
    tokens: OAuthTokenResponse;
    organizationId: string;
    userId: string;
    accountId: string;
  }> {
    const state = this.decryptState(encryptedState);
    const redirectUri = this.getRedirectUri();

    try {
      const response = await firstValueFrom(
        this.httpService.post<OAuthTokenResponse>(
          OPENAI_TOKEN_URL,
          new URLSearchParams({
            client_id: OPENAI_CODEX_CLIENT_ID,
            code,
            code_verifier: state.codeVerifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      const tokens = response.data;

      // Extract accountId from the JWT access token
      const accountId = this.extractAccountId(tokens.access_token);

      this.loggerService.log(`${this.constructorName}: OAuth tokens obtained`, {
        accountId,
        expiresIn: tokens.expires_in,
        hasRefreshToken: !!tokens.refresh_token,
        organizationId: state.organizationId,
      });

      return {
        accountId,
        organizationId: state.organizationId,
        tokens,
        userId: state.userId,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: Token exchange failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Refresh an expired access token using the refresh token.
   * Returns the new token set.
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<OAuthTokenResponse>(
          OPENAI_TOKEN_URL,
          new URLSearchParams({
            client_id: OPENAI_CODEX_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      this.loggerService.log(
        `${this.constructorName}: Access token refreshed`,
        { expiresIn: response.data.expires_in },
      );

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}: Token refresh failed`,
        error,
      );
      throw error;
    }
  }

  /**
   * Build a BYOK key entry from OAuth tokens.
   * Stores access_token in apiKey, refresh_token in apiSecret.
   */
  buildByokEntry(tokens: OAuthTokenResponse, accountId: string): IByokKeyEntry {
    return {
      apiKey: EncryptionUtil.encrypt(tokens.access_token),
      apiSecret: tokens.refresh_token
        ? EncryptionUtil.encrypt(tokens.refresh_token)
        : undefined,
      authMode: 'oauth',
      expiresAt: Date.now() + tokens.expires_in * 1000,
      isEnabled: true,
      lastValidatedAt: new Date(),
      oauthAccountId: accountId,
      provider: ByokProvider.OPENAI,
    };
  }

  /**
   * Extract the accountId (org ID) from an OpenAI JWT access token.
   */
  private extractAccountId(accessToken: string): string {
    try {
      const payload = accessToken.split('.')[1];
      if (!payload) {
        return 'unknown';
      }

      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );

      // OpenAI puts org info in various claims
      return decoded.org_id || decoded.account_id || decoded.sub || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
