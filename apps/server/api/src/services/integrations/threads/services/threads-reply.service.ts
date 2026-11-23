import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { requireMetaScopes } from '@api/services/integrations/_shared/meta-page-access.util';
import { ThreadsService } from '@api/services/integrations/threads/services/threads.service';
import { isThreadsPermissionError } from '@api/services/integrations/threads/utils/threads-permission-error.util';
import { toThreadsReplies } from '@api/services/integrations/threads/utils/threads-reply.util';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  THREADS_MANAGE_REPLIES_SCOPE,
  THREADS_READ_REPLIES_SCOPE,
} from '@genfeedai/contracts/constants';
import type {
  IThreadsGraphPost,
  IThreadsGraphReply,
  IThreadsReply,
} from '@genfeedai/contracts/interfaces/integrations/threads.interface';
import {
  THREADS_API_VERSION,
  THREADS_GRAPH_URL,
} from '@genfeedai/integrations';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/** Posts read per sync. Each costs one call for its replies, so this bounds it. */
const POSTS_PER_SYNC = 10;

const RECONNECT_MESSAGE =
  'Reconnect Threads and grant reply access to read and answer replies.';

/**
 * What the Messages inbox needs from a connected Threads account: the replies
 * on its posts, and a reply sent to one of them. Both run as the credential's
 * own account. A grant that lacks a reply permission is refused with a message
 * that asks the user to reconnect: before any call when the grant is recorded,
 * and from Threads' own refusal for accounts connected before it was recorded.
 */
@Traced()
@Injectable()
export class ThreadsReplyService {
  private readonly apiBase: string;

  constructor(
    configService: ConfigService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly threadsService: ThreadsService,
  ) {
    this.apiBase = `${
      configService.get('THREADS_GRAPH_URL') || THREADS_GRAPH_URL
    }/${configService.get('THREADS_API_VERSION') || THREADS_API_VERSION}`;
  }

  /** Recent replies on the account's posts, nested replies included. */
  async listReplies(
    organizationId: string,
    brandId: string,
    credentialId: string,
    limit = 25,
  ): Promise<IThreadsReply[]> {
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
      [THREADS_READ_REPLIES_SCOPE],
    );
    const accessToken = EncryptionUtil.decrypt(credential.accessToken ?? '');
    const replyLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    try {
      const posts = await firstValueFrom(
        this.httpService.get<{
          data?: Array<{ id: string; permalink?: string; text?: string }>;
        }>(`${this.apiBase}/me/threads`, {
          params: {
            access_token: accessToken,
            fields: 'id,text,permalink,timestamp',
            limit: POSTS_PER_SYNC,
          },
        }),
      );

      const withReplies: IThreadsGraphPost[] = await Promise.all(
        (posts.data.data ?? []).map(async (post) => ({
          ...post,
          replies: await this.readConversation(
            post.id,
            accessToken,
            replyLimit,
          ),
        })),
      );

      const replies = toThreadsReplies(withReplies);
      this.loggerService.log('ThreadsReplyService listReplies succeeded', {
        count: replies.length,
        credentialId,
      });
      return replies;
    } catch (error: unknown) {
      throw this.refuseMissingGrant(error);
    }
  }

  /** Answer a reply (or a post) as the connected account. */
  async replyTo(
    organizationId: string,
    brandId: string,
    replyToId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ replyId: string }> {
    await this.resolveCredential(organizationId, brandId, credentialId, [
      THREADS_MANAGE_REPLIES_SCOPE,
    ]);

    try {
      const { threadId } = await this.threadsService.publishText(
        organizationId,
        brandId,
        text,
        replyToId,
        credentialId,
      );
      return { replyId: threadId };
    } catch (error: unknown) {
      throw this.refuseMissingGrant(error);
    }
  }

  private async readConversation(
    postId: string,
    accessToken: string,
    limit: number,
  ): Promise<IThreadsGraphReply[]> {
    const response = await firstValueFrom(
      this.httpService.get<{ data?: IThreadsGraphReply[] }>(
        `${this.apiBase}/${postId}/conversation`,
        {
          params: {
            access_token: accessToken,
            fields:
              'id,text,username,permalink,timestamp,is_reply_owned_by_me,replied_to',
            limit,
          },
        },
      ),
    );
    return response.data.data ?? [];
  }

  private async resolveCredential(
    organizationId: string,
    brandId: string,
    credentialId: string | undefined,
    requiredScopes: readonly string[],
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      organizationId,
      platform: CredentialPlatform.THREADS,
    });
    if (!credential?.accessToken) {
      throw new BadRequestException(
        'This Threads connection has no access token. Reconnect it.',
      );
    }
    try {
      requireMetaScopes(credential.grantedScopes, requiredScopes);
    } catch {
      throw new BadRequestException(RECONNECT_MESSAGE);
    }
    return credential;
  }

  private refuseMissingGrant(error: unknown): unknown {
    return isThreadsPermissionError(error)
      ? new BadRequestException(RECONNECT_MESSAGE)
      : error;
  }
}
