import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { requireMetaScopes } from '@api/services/integrations/_shared/meta-page-access.util';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { toPageComments } from '@api/services/integrations/facebook/utils/facebook-inbox.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  FACEBOOK_FEED_WEBHOOK_FIELD,
  FACEBOOK_PAGE_WEBHOOK_SCOPE,
} from '@genfeedai/contracts/constants';
import type {
  IFacebookGraphPost,
  IFacebookPageComment,
} from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import {
  META_GRAPH_API_VERSION,
  META_GRAPH_URL,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/** Posts read per sync. Each carries its comments, so this bounds the call. */
const PAGE_POSTS_PER_SYNC = 10;

interface FacebookPageAccess {
  pageId: string;
  pageToken: string;
}

/**
 * What the Messages inbox needs from a connected Facebook Page: the webhook
 * subscription and the comments on the Page's posts. The Page is the
 * credential's `externalId`; its token is read from the account's Page list.
 */
@Traced()
@Injectable()
export class FacebookInboxService {
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

  /**
   * Subscribe the Page to the app's feed webhook so a comment reaches Messages
   * without a manual sync. Idempotent: Meta keeps one subscription per app.
   * A grant that lacks `pages_manage_metadata` is refused before any call, with
   * a message that asks the user to reconnect.
   */
  async ensureWebhookSubscription(
    organizationId: string,
    brandId: string,
    credentialId: string,
  ): Promise<void> {
    const access = await this.resolvePageAccess(
      organizationId,
      brandId,
      credentialId,
      [FACEBOOK_PAGE_WEBHOOK_SCOPE],
    );

    await firstValueFrom(
      this.httpService.post(
        `${this.apiBase}/${access.pageId}/subscribed_apps`,
        null,
        {
          params: {
            access_token: access.pageToken,
            subscribed_fields: FACEBOOK_FEED_WEBHOOK_FIELD,
          },
        },
      ),
    );
  }

  /** Recent comments on the Page's published posts, replies included. */
  async listPageComments(
    organizationId: string,
    brandId: string,
    credentialId: string,
    limit = 25,
  ): Promise<IFacebookPageComment[]> {
    const access = await this.resolvePageAccess(
      organizationId,
      brandId,
      credentialId,
    );
    const commentLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    const response = await firstValueFrom(
      this.httpService.get<{ data?: IFacebookGraphPost[] }>(
        `${this.apiBase}/${access.pageId}/published_posts`,
        {
          params: {
            access_token: access.pageToken,
            fields: `id,message,permalink_url,comments.filter(stream).order(reverse_chronological).limit(${commentLimit}){id,message,created_time,from{id,name},parent{id}}`,
            limit: PAGE_POSTS_PER_SYNC,
          },
        },
      ),
    );

    const comments = toPageComments(response.data.data ?? [], access.pageId);
    this.loggerService.log('FacebookInboxService listPageComments succeeded', {
      count: comments.length,
      pageId: access.pageId,
    });

    return comments;
  }

  private async resolvePageAccess(
    organizationId: string,
    brandId: string,
    credentialId: string,
    requiredScopes: readonly string[] = [],
  ): Promise<FacebookPageAccess> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });
    if (!credential?.externalId) {
      throw new BadRequestException(
        'This Facebook connection is not bound to a Page. Reconnect it and choose a Page.',
      );
    }
    requireMetaScopes(credential.grantedScopes, requiredScopes);

    const pages = await this.facebookService.getUserPages(
      organizationId,
      brandId,
      credential.id,
    );
    const pageToken = pages.find(
      (page) => page.id === credential.externalId,
    )?.accessToken;
    if (!pageToken) {
      throw new BadRequestException(
        'Facebook no longer lets this account manage the connected Page. Reconnect it.',
      );
    }

    return { pageId: credential.externalId, pageToken };
  }
}
