import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import {
  type FacebookPageAccess,
  type FacebookPageScope,
  resolveFacebookPageAccess,
} from '@api/services/integrations/facebook/utils/facebook-page-access.util';
import { FACEBOOK_LIVE_VIDEO_SCOPE } from '@genfeedai/contracts/constants';
import type { IFacebookGraphLiveVideo } from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import {
  META_GRAPH_API_VERSION,
  META_GRAPH_URL,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { BadGatewayException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/** A live video as Genfeed keeps it: the key is not part of it. */
export interface FacebookLiveVideoStart {
  liveVideoId: string;
  permalinkUrl?: string;
  /** The Graph node's own stream URL. Holds the stream key: hand it to the user, never store or log it. */
  streamUrl: string;
}

export interface FacebookLiveVideoState {
  isLive: boolean;
  permalinkUrl?: string;
  status: string;
}

/** Graph statuses while a live video is still on air or waiting for its encoder. */
const ON_AIR_STATUSES: ReadonlySet<string> = new Set([
  'LIVE',
  'LIVE_NOW',
  'UNPUBLISHED',
]);

/**
 * Creates and ends live videos on a connected Facebook Page (`publish_video`).
 * The Page is the credential's `externalId`. The stream URL carries the stream
 * key, so it only ever leaves this service in the return value of `start`.
 */
@Traced()
@Injectable()
export class FacebookLiveVideoService {
  private readonly apiBase: string;

  constructor(
    configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly facebookService: FacebookService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
  ) {
    this.apiBase = `${META_GRAPH_URL}/${
      configService.get('FACEBOOK_API_VERSION') || META_GRAPH_API_VERSION
    }`;
  }

  /** Create a live video on the Page and put it on air as soon as the encoder connects. */
  async start(
    scope: FacebookPageScope,
    input: { description?: string; title: string },
  ): Promise<FacebookLiveVideoStart> {
    const access = await this.resolveAccess(scope);

    const response = await firstValueFrom(
      this.httpService.post<IFacebookGraphLiveVideo>(
        `${this.apiBase}/${access.pageId}/live_videos`,
        null,
        {
          params: {
            access_token: access.pageToken,
            ...(input.description ? { description: input.description } : {}),
            fields: 'id,permalink_url,secure_stream_url,status',
            status: 'LIVE_NOW',
            title: input.title,
          },
        },
      ),
    );

    const {
      id,
      permalink_url: permalinkUrl,
      secure_stream_url,
    } = response.data;
    if (!id || !secure_stream_url) {
      throw new BadGatewayException(
        'Facebook did not return the live video or its stream address.',
      );
    }
    // Logged without the stream URL: it holds the key.
    this.loggerService.log('FacebookLiveVideoService start succeeded', {
      liveVideoId: id,
      pageId: access.pageId,
    });

    return {
      liveVideoId: id,
      permalinkUrl: absoluteFacebookUrl(permalinkUrl),
      streamUrl: secure_stream_url,
    };
  }

  /** Stop the broadcast. Idempotent: ending an ended video leaves it ended. */
  async end(
    scope: FacebookPageScope,
    liveVideoId: string,
  ): Promise<FacebookLiveVideoState> {
    const access = await this.resolveAccess(scope);

    const before = await this.read(access, liveVideoId);
    if (before.isLive) {
      await firstValueFrom(
        this.httpService.post(`${this.apiBase}/${liveVideoId}`, null, {
          params: { access_token: access.pageToken, end_live_video: true },
        }),
      );
    }
    const after = await this.read(access, liveVideoId);
    this.loggerService.log('FacebookLiveVideoService end succeeded', {
      liveVideoId,
      status: after.status,
    });

    return after;
  }

  private async read(
    access: FacebookPageAccess,
    liveVideoId: string,
  ): Promise<FacebookLiveVideoState> {
    const response = await firstValueFrom(
      this.httpService.get<IFacebookGraphLiveVideo>(
        `${this.apiBase}/${liveVideoId}`,
        {
          params: {
            access_token: access.pageToken,
            fields: 'id,permalink_url,status',
          },
        },
      ),
    );
    const status = response.data.status ?? 'UNKNOWN';

    return {
      isLive: ON_AIR_STATUSES.has(status),
      permalinkUrl: absoluteFacebookUrl(response.data.permalink_url),
      status,
    };
  }

  private resolveAccess(scope: FacebookPageScope): Promise<FacebookPageAccess> {
    return resolveFacebookPageAccess(
      {
        credentialsService: this.credentialsService,
        facebookService: this.facebookService,
      },
      scope,
      [FACEBOOK_LIVE_VIDEO_SCOPE],
    );
  }
}

/** Graph returns permalinks as paths ("/page/videos/1"). */
function absoluteFacebookUrl(
  permalink: string | undefined,
): string | undefined {
  if (!permalink) return undefined;
  return permalink.startsWith('http')
    ? permalink
    : `https://www.facebook.com${permalink}`;
}
