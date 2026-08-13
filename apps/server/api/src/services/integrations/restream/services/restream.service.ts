import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface RestreamTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface RestreamProfile {
  id: string;
  username?: string;
  email?: string;
}

/**
 * Official Restream OAuth scopes for livestream chat ingest + profile.
 * @see https://developers.restream.io/authentication/code-exchange
 */
export const RESTREAM_OAUTH_SCOPE = 'profile.read chat.read';

/**
 * Restream OAuth2 + Chat WebSocket helpers.
 * @see https://developers.restream.io/authentication/authorize-dialog
 * @see https://developers.restream.io/chat/getting-started
 */
@Injectable()
export class RestreamService {
  private readonly constructorName = String(this.constructor.name);
  private readonly authUrl = 'https://api.restream.io/login';
  private readonly tokenUrl = 'https://api.restream.io/oauth/token';
  private readonly profileUrl = 'https://api.restream.io/v2/user/profile';
  private readonly chatWsBase = 'wss://chat.api.restream.io/ws';

  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    this.clientId = this.readConfigString('RESTREAM_CLIENT_ID');
    this.clientSecret = this.readConfigString('RESTREAM_CLIENT_SECRET');
    const explicitRedirect = this.readConfigString('RESTREAM_REDIRECT_URI');
    const appUrl = this.readConfigString('GENFEEDAI_APP_URL');
    this.redirectUri =
      explicitRedirect ||
      (appUrl ? `${appUrl.replace(/\/$/, '')}/oauth/restream` : undefined);
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  private readConfigString(key: string): string | undefined {
    const value = this.configService.get(key);
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  generateAuthUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Restream OAuth is not configured. Set RESTREAM_CLIENT_ID and RESTREAM_REDIRECT_URI.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: RESTREAM_OAUTH_SCOPE,
      state,
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  buildChatWebSocketUrl(accessToken: string): string {
    const token = accessToken.trim();
    if (!token) {
      throw new Error('Restream access token is required');
    }
    return `${this.chatWsBase}?accessToken=${encodeURIComponent(token)}`;
  }

  async exchangeCodeForToken(code: string): Promise<RestreamTokenResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new HttpException(
        {
          detail:
            'Restream OAuth is not configured. Set RESTREAM_CLIENT_ID, RESTREAM_CLIENT_SECRET, and RESTREAM_REDIRECT_URI.',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const body = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      });

      const basic = Buffer.from(
        `${this.clientId}:${this.clientSecret}`,
      ).toString('base64');

      const response = await firstValueFrom(
        this.httpService.post<RestreamTokenResponse>(
          this.tokenUrl,
          body.toString(),
          {
            headers: {
              Authorization: `Basic ${basic}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      if (!response.data?.access_token) {
        throw new HttpException(
          {
            detail: 'Restream did not return an access token',
            title: 'Token Exchange Failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      this.loggerService.log(`${url} succeeded`, {
        hasAccessToken: true,
        hasRefreshToken: Boolean(response.data.refresh_token),
      });

      return response.data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.loggerService.error(`${url} failed`, error);
      throw new HttpException(
        {
          detail: 'Failed to exchange Restream authorization code',
          title: 'Token Exchange Failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<RestreamTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new HttpException(
        {
          detail: 'Restream OAuth is not configured',
          title: 'Configuration Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );

    const response = await firstValueFrom(
      this.httpService.post<RestreamTokenResponse>(
        this.tokenUrl,
        body.toString(),
        {
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      ),
    );

    if (!response.data?.access_token) {
      throw new HttpException(
        {
          detail: 'Restream refresh did not return an access token',
          title: 'Token Refresh Failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return response.data;
  }

  async getProfile(accessToken: string): Promise<RestreamProfile> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(this.profileUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      const data = response.data ?? {};
      const id =
        typeof data.id === 'string' && data.id.length > 0
          ? data.id
          : typeof data.userId === 'string' && data.userId.length > 0
            ? data.userId
            : undefined;

      if (!id) {
        throw new HttpException(
          {
            detail: 'Restream profile is missing an id',
            title: 'Profile Lookup Failed',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        email: typeof data.email === 'string' ? data.email : undefined,
        id,
        username:
          typeof data.username === 'string'
            ? data.username
            : typeof data.displayName === 'string'
              ? data.displayName
              : undefined,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          detail: 'Failed to load Restream profile',
          title: 'Profile Lookup Failed',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Open Restream Chat WS for a short window and collect actions.
   * Used by minute-cadence livestream session processing (not a permanent daemon).
   */
  async collectChatActions(
    accessToken: string,
    options: { maxMessages?: number; listenMs?: number } = {},
  ): Promise<Array<Record<string, unknown>>> {
    const listenMs = options.listenMs ?? 8_000;
    const maxMessages = options.maxMessages ?? 40;
    const wsUrl = this.buildChatWebSocketUrl(accessToken);

    const WebSocketCtor = (
      globalThis as unknown as {
        WebSocket?: new (
          url: string,
        ) => {
          close: () => void;
          onclose: ((ev: unknown) => void) | null;
          onerror: ((ev: unknown) => void) | null;
          onmessage: ((ev: { data: unknown }) => void) | null;
          onopen: ((ev: unknown) => void) | null;
        };
      }
    ).WebSocket;

    if (!WebSocketCtor) {
      this.loggerService.warn(
        'WebSocket runtime unavailable; skipping Restream chat collect',
        { context: this.constructorName },
      );
      return [];
    }

    return new Promise((resolve) => {
      const actions: Array<Record<string, unknown>> = [];
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        try {
          socket.close();
        } catch {
          // ignore
        }
        resolve(actions);
      };

      const socket = new WebSocketCtor(wsUrl);
      const timer = setTimeout(finish, listenMs);

      socket.onmessage = (event) => {
        try {
          const raw =
            typeof event.data === 'string'
              ? event.data
              : String(event.data ?? '');
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          actions.push(parsed);
          if (actions.length >= maxMessages) {
            clearTimeout(timer);
            finish();
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onerror = () => {
        clearTimeout(timer);
        finish();
      };

      socket.onclose = () => {
        clearTimeout(timer);
        finish();
      };
    });
  }
}
