import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  BlueskyCredentialRejectedError,
  isBlueskyCredentialRejection,
  isBlueskySessionTokenError,
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
/**
 * `createSession` is limited to 30 per 5 minutes and 300 per day per account
 * (docs.bsky.app/docs/rate-limits), so a session is reused between publishes.
 */
const SESSION_CACHE_TTL_MS = 25 * 60_000;
/** The PDS refuses a blob over 50 MiB whatever the lexicon allows. */
export const BLUESKY_MAX_VIDEO_BYTES = 52_428_800;
const MAX_IMAGE_DOWNLOAD_BYTES = 30 * 1024 * 1024;
/** A verification scan stops once a whole page predates the attempt by this. */
const VERIFICATION_STALE_MARGIN_MS = 10 * 60_000;
/** Unauthenticated, cached AppView host Bluesky documents for public reads. */
const PUBLIC_APPVIEW_URL = 'https://public.api.bsky.app';
const POST_COLLECTION = 'app.bsky.feed.post';
const POST_URI_PATTERN = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/;

export interface BlueskySession {
  accessJwt: string;
  did: string;
  handle: string;
  serviceUrl: string;
}

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

interface CachedSession {
  expiresAt: number;
  session: BlueskySession;
  storedSecret: string;
}

interface XrpcRequest {
  accessJwt?: string;
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
  private readonly sessions = new Map<string, CachedSession>();

  constructor(
    private readonly configService: ConfigService,
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
          headers: {
            ...(request.accessJwt
              ? { Authorization: `Bearer ${request.accessJwt}` }
              : {}),
            ...(request.contentType
              ? { 'Content-Type': request.contentType }
              : {}),
          },
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

  /**
   * Sign in with a handle and app password. Used to verify a new connection
   * and, with the stored password, to open a session for a publish.
   */
  async createSession(
    serviceUrl: string,
    identifier: string,
    appPassword: string,
  ): Promise<BlueskySession> {
    const data = await this.xrpc<Record<string, unknown>>(serviceUrl, {
      body: { identifier, password: appPassword },
      method: 'POST',
      nsid: 'com.atproto.server.createSession',
    });
    return {
      accessJwt: requireString(data.accessJwt, 'accessJwt'),
      did: requireString(data.did, 'did'),
      handle: requireString(data.handle, 'handle'),
      serviceUrl: this.assertServiceUrl(serviceUrl),
    };
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
      const { avatar, banner, displayName } = response.data;
      return {
        avatar: typeof avatar === 'string' ? avatar : undefined,
        banner: typeof banner === 'string' ? banner : undefined,
        displayName: typeof displayName === 'string' ? displayName : undefined,
      };
    } catch (error: unknown) {
      this.loggerService.warn(`${this.constructorName} profile unavailable`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private readStoredLogin(credential: CredentialDocument): {
    appPassword: string;
    identifier: string;
    serviceUrl: string;
  } {
    if (
      !credential.accessToken ||
      !credential.description ||
      !(credential.externalId || credential.externalHandle)
    ) {
      throw new Error('Bluesky credential is incomplete. Reconnect Bluesky.');
    }
    return {
      appPassword: EncryptionUtil.decrypt(credential.accessToken),
      // The DID never changes when a handle does, so it is the safer login.
      identifier: (credential.externalId || credential.externalHandle) ?? '',
      serviceUrl: credential.description,
    };
  }

  /**
   * An open session for this credential. A refused password or a taken-down
   * account marks the channel disconnected, alerts the owner and throws
   * {@link BlueskyCredentialRejectedError}; any other failure is rethrown.
   */
  async openSession(
    credential: CredentialDocument,
    isFresh = false,
  ): Promise<BlueskySession> {
    const login = this.readStoredLogin(credential);
    const cached = this.sessions.get(credential.id);
    if (
      !isFresh &&
      cached &&
      cached.expiresAt > Date.now() &&
      cached.storedSecret === credential.accessToken
    ) {
      return cached.session;
    }

    try {
      const session = await this.createSession(
        login.serviceUrl,
        login.identifier,
        login.appPassword,
      );
      if (credential.externalId && session.did !== credential.externalId) {
        throw new Error('Bluesky account changed. Reconnect Bluesky.');
      }
      this.sessions.set(credential.id, {
        expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
        session,
        storedSecret: credential.accessToken ?? '',
      });
      return session;
    } catch (error: unknown) {
      this.sessions.delete(credential.id);
      if (isBlueskyCredentialRejection(error)) {
        await this.markDisconnected(credential);
        throw new BlueskyCredentialRejectedError();
      }
      throw error;
    }
  }

  /** Run an authenticated call, replacing a lapsed session token once. */
  private async withSession<T>(
    credential: CredentialDocument,
    run: (session: BlueskySession) => Promise<T>,
  ): Promise<T> {
    const session = await this.openSession(credential);
    try {
      return await run(session);
    } catch (error: unknown) {
      if (!isBlueskySessionTokenError(error)) {
        throw error;
      }
      return run(await this.openSession(credential, true));
    }
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
        'Bluesky refused the connected app password. Posts scheduled on this account will fail until you reconnect it.',
      version: 1,
    };
    await this.activityRecorder.record({
      alert: { payload: alertPayload },
      brandId: credential.brandId ?? undefined,
      key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      organizationId: credential.organizationId ?? null,
      source: ActivitySource.SOCIAL_INTEGRATION,
      userId: credential.userId ?? undefined,
      value: 'Bluesky integration disconnected: app password refused',
    });
  }

  /**
   * Re-check the stored login. Bluesky app passwords do not expire, so there
   * is nothing to renew; this confirms the credential still works.
   */
  async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<BlueskySession> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.BLUESKY,
    });
    if (!credential) {
      throw new Error('Bluesky credential not found');
    }
    return this.openSession(credential, true);
  }

  /** Facets for a post, with each mention resolved to a DID. */
  async buildFacets(
    credential: CredentialDocument,
    text: string,
  ): Promise<BlueskyFacet[]> {
    const { serviceUrl } = this.readStoredLogin(credential);
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
      this.xrpc<{ blob?: BlueskyBlobRef }>(session.serviceUrl, {
        accessJwt: session.accessJwt,
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
      this.xrpc<{ cid?: unknown; uri?: unknown }>(session.serviceUrl, {
        accessJwt: session.accessJwt,
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
    const { serviceUrl } = this.readStoredLogin(credential);
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
