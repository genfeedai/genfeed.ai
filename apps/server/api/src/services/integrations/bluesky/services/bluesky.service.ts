import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  BlueskyOAuthService,
  type BlueskySessionBinding,
} from '@api/services/integrations/bluesky/services/bluesky-oauth.service';
import {
  BlueskyCredentialRejectedError,
  BlueskyHttpError,
  isBlueskyCredentialRejection,
  isBlueskySessionLost,
} from '@api/services/integrations/bluesky/utils/bluesky-api-error.util';
import {
  type BlueskyFacet,
  buildBlueskyFacets,
} from '@api/services/integrations/bluesky/utils/bluesky-richtext.util';
import { parseBlueskyServiceUrl } from '@api/services/integrations/bluesky/utils/bluesky-service-url.util';
import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS } from '@api/services/integrations/publishers/publisher-verification.util';
import { parseBlueskyVerificationPage } from '@api/services/integrations/publishers/publisher-verification-pages.util';
import type { AlertEmailNotificationPayload } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { createSafeWebhookHttpsAgent } from '@api/shared/utils/webhook-validator/webhook-validator.util';
import type {
  NodeSavedSession,
  OAuthSession,
} from '@atproto/oauth-client-node';
import {
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
/** The PDS refuses a blob over 50 MiB whatever the lexicon allows. */
export const BLUESKY_MAX_VIDEO_BYTES = 52_428_800;
const MAX_IMAGE_DOWNLOAD_BYTES = 30 * 1024 * 1024;
/** A verification scan stops once a whole page predates the attempt by this. */
const VERIFICATION_STALE_MARGIN_MS = 10 * 60_000;
/** Unauthenticated, cached AppView host Bluesky documents for public reads. */
const PUBLIC_APPVIEW_URL = 'https://public.api.bsky.app';
const POST_COLLECTION = 'app.bsky.feed.post';
const POST_URI_PATTERN = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/;

export interface BlueskyStrongRef {
  cid: string;
  uri: string;
}

export interface BlueskyBlobRef {
  $type: 'blob';
  mimeType: string;
  ref: { $link: string };
  size: number;
}

export interface BlueskyProfile {
  avatar?: string;
  banner?: string;
  displayName?: string;
  handle?: string;
}

export type BlueskyEmbed =
  | {
      $type: 'app.bsky.embed.images';
      images: Array<{
        alt: string;
        aspectRatio: { height: number; width: number };
        image: BlueskyBlobRef;
      }>;
    }
  | { $type: 'app.bsky.embed.video'; video: BlueskyBlobRef };

export interface BlueskyPostRecord {
  $type: 'app.bsky.feed.post';
  createdAt: string;
  embed?: BlueskyEmbed;
  facets?: BlueskyFacet[];
  reply?: { parent: BlueskyStrongRef; root: BlueskyStrongRef };
  text: string;
}

export interface BlueskyMediaDownload {
  buffer: Buffer;
  contentType: string;
}

interface XrpcRequest {
  body?: Buffer | Record<string, unknown>;
  contentType?: string;
  method: 'GET' | 'POST';
  nsid: string;
  params?: Record<string, string | number>;
  timeoutMs?: number;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Bluesky response is missing ${what}`);
  }
  return value;
}

@Traced()
@Injectable()
export class BlueskyService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly oauthService: BlueskyOAuthService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  private assertServiceUrl(input: string): string {
    const parsed = parseBlueskyServiceUrl(input);
    if (!parsed.ok) {
      throw new BadRequestException('Invalid Bluesky server address');
    }
    return parsed.serviceUrl;
  }

  /** One XRPC call. Requests are pinned to the resolved public address. */
  private async xrpc<T>(serviceUrl: string, request: XrpcRequest): Promise<T> {
    const origin = this.assertServiceUrl(serviceUrl);
    const httpsAgent = await createSafeWebhookHttpsAgent(origin);
    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          data: request.body,
          headers: request.contentType
            ? { 'Content-Type': request.contentType }
            : {},
          httpsAgent,
          maxBodyLength: Number.POSITIVE_INFINITY,
          maxRedirects: 0,
          method: request.method,
          params: request.params,
          timeout: request.timeoutMs ?? REQUEST_TIMEOUT_MS,
          url: `${origin}/xrpc/${request.nsid}`,
        }),
      );
      return response.data;
    } finally {
      httpsAgent.destroy();
    }
  }

  /** Display name and images of a public profile; never fails a connect. */
  async getPublicProfile(did: string): Promise<BlueskyProfile> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<Record<string, unknown>>(
          `${PUBLIC_APPVIEW_URL}/xrpc/app.bsky.actor.getProfile`,
          {
            maxRedirects: 0,
            params: { actor: did },
            timeout: REQUEST_TIMEOUT_MS,
          },
        ),
      );
      const { avatar, banner, displayName, handle } = response.data;
      return {
        avatar: typeof avatar === 'string' ? avatar : undefined,
        banner: typeof banner === 'string' ? banner : undefined,
        displayName: typeof displayName === 'string' ? displayName : undefined,
        handle: typeof handle === 'string' ? handle : undefined,
      };
    } catch (error: unknown) {
      this.loggerService.warn(`${this.constructorName} profile unavailable`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /** The origin of the server the account lives on, saved when it connected. */
  private readServiceUrl(credential: CredentialDocument): string {
    if (!credential.description || !credential.externalId) {
      throw new Error('Bluesky credential is incomplete. Reconnect Bluesky.');
    }
    return credential.description;
  }

  /**
   * Where a credential keeps its OAuth session. It reads the stored row each
   * time: refresh tokens rotate on use, so a copy held in memory by a publish
   * that started earlier would present a token another process already spent.
   */
  private bindingFor(credential: CredentialDocument): BlueskySessionBinding {
    const scope = {
      id: credential.id,
      isDeleted: false,
      organizationId: credential.organizationId ?? undefined,
    };
    return {
      read: async () => {
        const stored = await this.credentialsService.findOne(scope);
        return stored?.accessToken
          ? (JSON.parse(
              EncryptionUtil.decrypt(stored.accessToken),
            ) as NodeSavedSession)
          : undefined;
      },
      remove: async () => {
        await this.credentialsService.patch(credential.id, {
          accessToken: null,
        });
      },
      write: async (session) => {
        await this.credentialsService.patch(credential.id, {
          accessToken: JSON.stringify(session),
        });
      },
    };
  }

  /**
   * An open session for this credential. When Bluesky no longer accepts it (the
   * person revoked access, or the session ended) the channel is marked
   * disconnected, the owner is alerted and {@link BlueskyCredentialRejectedError}
   * is thrown; any other failure is rethrown.
   */
  private async openSession(
    credential: CredentialDocument,
  ): Promise<OAuthSession> {
    this.readServiceUrl(credential);
    if (!credential.accessToken) {
      await this.markDisconnected(credential);
      throw new BlueskyCredentialRejectedError();
    }
    try {
      return await this.oauthService.restoreSession(
        credential.externalId ?? '',
        this.bindingFor(credential),
      );
    } catch (error: unknown) {
      if (isBlueskySessionLost(error)) {
        await this.markDisconnected(credential);
        throw new BlueskyCredentialRejectedError();
      }
      throw error;
    }
  }

  /** Run a call as the account. A refusal marks the channel disconnected. */
  private async withSession<T>(
    credential: CredentialDocument,
    run: (session: OAuthSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.openSession(credential);
    try {
      return await run(session);
    } catch (error: unknown) {
      if (isBlueskyCredentialRejection(error)) {
        await this.markDisconnected(credential);
        throw new BlueskyCredentialRejectedError();
      }
      throw error;
    }
  }

  /** One signed XRPC call. The session adds the DPoP proof and refreshes tokens. */
  private async signedXrpc<T>(
    session: OAuthSession,
    request: XrpcRequest,
  ): Promise<T> {
    const query = request.params
      ? `?${new URLSearchParams(
          Object.entries(request.params).map(([key, value]) => [
            key,
            String(value),
          ]),
        ).toString()}`
      : '';
    const isBinary = Buffer.isBuffer(request.body);
    const response = await session.fetchHandler(
      `/xrpc/${request.nsid}${query}`,
      {
        body: isBinary
          ? new Uint8Array(request.body as Buffer)
          : request.body
            ? JSON.stringify(request.body)
            : undefined,
        headers: {
          ...(request.contentType
            ? { 'Content-Type': request.contentType }
            : request.body
              ? { 'Content-Type': 'application/json' }
              : {}),
        },
        method: request.method,
        signal: AbortSignal.timeout(request.timeoutMs ?? REQUEST_TIMEOUT_MS),
      },
    );
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw BlueskyHttpError.fromResponse(response, data);
    }
    return data as T;
  }

  private async markDisconnected(credential: CredentialDocument) {
    // Already disconnected and already alerted: do not alert on every post.
    if (credential.isConnected === false) {
      return;
    }
    await this.credentialsService.patch(credential.id, { isConnected: false });

    const handle =
      credential.externalHandle ?? credential.externalName ?? 'Bluesky account';
    const alertPayload: AlertEmailNotificationPayload = {
      event: 'channel_disconnected',
      kind: 'alert_email',
      label: handle,
      summary:
        'Bluesky no longer accepts the connected session. Posts scheduled on this account will fail until you reconnect it.',
      version: 1,
    };
    await this.activityRecorder.record({
      alert: { payload: alertPayload },
      brandId: credential.brandId ?? undefined,
      key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      organizationId: credential.organizationId ?? null,
      source: ActivitySource.SOCIAL_INTEGRATION,
      userId: credential.userId ?? undefined,
      value: 'Bluesky integration disconnected: session no longer accepted',
    });
  }

  /** Facets for a post, with each mention resolved to a DID. */
  async buildFacets(
    credential: CredentialDocument,
    text: string,
  ): Promise<BlueskyFacet[]> {
    const serviceUrl = this.readServiceUrl(credential);
    return buildBlueskyFacets(text, async (handle) => {
      try {
        const data = await this.xrpc<{ did?: unknown }>(serviceUrl, {
          method: 'GET',
          nsid: 'com.atproto.identity.resolveHandle',
          params: { handle },
        });
        return typeof data.did === 'string' ? data.did : null;
      } catch {
        return null;
      }
    });
  }

  async uploadBlob(
    credential: CredentialDocument,
    buffer: Buffer,
    mimeType: string,
  ): Promise<BlueskyBlobRef> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const data = await this.withSession(credential, (session) =>
      this.signedXrpc<{ blob?: BlueskyBlobRef }>(session, {
        body: buffer,
        contentType: mimeType,
        method: 'POST',
        nsid: 'com.atproto.repo.uploadBlob',
        timeoutMs: UPLOAD_TIMEOUT_MS,
      }),
    );
    if (!data.blob) {
      throw new Error('Bluesky did not return the uploaded blob');
    }
    this.loggerService.log(`${url} success`, { size: data.blob.size });
    return data.blob;
  }

  /** Create the post record; its AT-URI and CID identify the post. */
  async createPost(
    credential: CredentialDocument,
    record: BlueskyPostRecord,
  ): Promise<BlueskyStrongRef> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const data = await this.withSession(credential, (session) =>
      this.signedXrpc<{ cid?: unknown; uri?: unknown }>(session, {
        body: {
          collection: POST_COLLECTION,
          record,
          repo: session.did,
        },
        method: 'POST',
        nsid: 'com.atproto.repo.createRecord',
      }),
    );
    const ref = {
      cid: requireString(data.cid, 'cid'),
      uri: requireString(data.uri, 'uri'),
    };
    this.loggerService.log(`${url} success`, { uri: ref.uri });
    return ref;
  }

  /** The CID of a post of this account, needed to reply to it. */
  async getPostRef(
    credential: CredentialDocument,
    uri: string,
  ): Promise<BlueskyStrongRef> {
    const serviceUrl = this.readServiceUrl(credential);
    const match = POST_URI_PATTERN.exec(uri);
    if (!match) {
      throw new Error('Bluesky post reference is not a post record');
    }
    const data = await this.xrpc<{ cid?: unknown; uri?: unknown }>(serviceUrl, {
      method: 'GET',
      nsid: 'com.atproto.repo.getRecord',
      params: { collection: POST_COLLECTION, repo: match[1], rkey: match[2] },
    });
    return { cid: requireString(data.cid, 'cid'), uri };
  }

  /**
   * One page of the account's posts, newest first, for confirming whether an
   * unconfirmed publish landed. Reading a repo needs no sign-in, so this does
   * not spend a `createSession`.
   */
  async listPublishVerificationPage(
    context: PublishContext,
    startedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId: context.brandId,
      credentialId: context.credential.id,
      organizationId: context.organizationId,
      platform: CredentialPlatform.BLUESKY,
    });
    if (
      !credential?.externalId ||
      credential.externalId !== context.credential.externalId ||
      !credential.description
    ) {
      throw new Error('Bluesky verification account unavailable or changed');
    }

    const data = await this.xrpc<unknown>(credential.description, {
      method: 'GET',
      nsid: 'com.atproto.repo.listRecords',
      params: {
        collection: POST_COLLECTION,
        limit: 100,
        repo: credential.externalId,
        ...(cursor ? { cursor } : {}),
      },
      timeoutMs: PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
    });
    const page = parseBlueskyVerificationPage(data, credential.externalId);

    // Posts come newest first. Once a whole page predates the attempt, the
    // post cannot be further back, so the scan is complete.
    const threshold = startedAt.getTime() - VERIFICATION_STALE_MARGIN_MS;
    const isPageStale =
      page.items.length > 0 &&
      page.items.every((item) => item.createdAt.getTime() < threshold);
    return isPageStale ? { ...page, nextCursor: null } : page;
  }

  /** Download a media file to upload as a blob, never past `maxBytes`. */
  async downloadMedia(
    mediaUrl: string,
    maxBytes: number,
  ): Promise<BlueskyMediaDownload> {
    const configuredOrigin = new URL(this.configService.cdnUrl).origin;
    const isConfiguredMedia = new URL(mediaUrl).origin === configuredOrigin;
    const response = await safeFetch(
      mediaUrl,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      {
        ...(isConfiguredMedia
          ? { allowedOrigins: [configuredOrigin], allowPrivateNetwork: true }
          : {}),
        maxRedirects: 0,
      },
    );
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length')) > maxBytes
    ) {
      await response.body?.cancel();
      throw new BadRequestException(
        `Bluesky media could not be downloaded within the ${Math.floor(maxBytes / (1024 * 1024))} MB limit`,
      );
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          throw new BadRequestException(
            `Bluesky media exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit`,
          );
        }
        chunks.push(Buffer.from(chunk.value));
      }
    } finally {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType:
        response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  /** Largest image download the publisher will accept. */
  get maxImageDownloadBytes(): number {
    return MAX_IMAGE_DOWNLOAD_BYTES;
  }
}
