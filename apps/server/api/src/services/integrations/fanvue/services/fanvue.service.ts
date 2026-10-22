import { constants as bufferConstants } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { request as requestHttps } from 'node:https';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { TLSSocket } from 'node:tls';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AxiosRequestConfig, AxiosRequestTransformer } from 'axios';
import { firstValueFrom, fromEvent, type Observable, takeUntil } from 'rxjs';
import { z } from 'zod';

const FANVUE_API_BASE = 'https://api.fanvue.com';
const FANVUE_AUTH_URL = 'https://auth.fanvue.com/oauth2/auth';
const FANVUE_TOKEN_URL = 'https://auth.fanvue.com/oauth2/token';
const FANVUE_API_VERSION = '2025-06-26';
const FANVUE_SCOPES = [
  'openid',
  'offline_access',
  'offline',
  'read:self',
  'read:media',
  'write:media',
  'write:post',
];

const fanvueUploadSessionSchema = z.object({
  mediaUuid: z.string().refine((value) => value.trim().length > 0),
  uploadId: z.string().refine((value) => value.trim().length > 0),
  partSize: z
    .number()
    .int()
    .positive()
    .max(Math.min(Number.MAX_SAFE_INTEGER, bufferConstants.MAX_LENGTH)),
  maxParts: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  totalParts: z.null(),
});
type FanvueUploadSession = z.infer<typeof fanvueUploadSessionSchema>;
type FanvueUploadStage =
  | 'source'
  | 'create'
  | 'sign'
  | 'put'
  | 'complete'
  | 'cleanup';
interface FanvueUploadContext {
  controller: AbortController;
  stage: FanvueUploadStage;
  source?: Readable;
  sourceDone?: Promise<boolean>;
  sourceAborted?: () => void;
}
interface FanvueUploadedPart {
  ETag: string;
  PartNumber: number;
}
interface FanvuePartTransport {
  request: (
    options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => ClientRequest;
  finished?: Promise<boolean>;
  dispose: () => Promise<void>;
}

interface FanvueTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface FanvuePostResponse {
  uuid: string;
  content: string;
  createdAt: string;
  visibility: string;
}

@Injectable()
export class FanvueService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  requireConfigured(): void {
    this.getOAuthConfig();
  }

  /**
   * Generate PKCE code_verifier and code_challenge pair
   */
  generatePkce(): { codeVerifier: string; codeChallenge: string } {
    // Generate a 64-byte random string, base64url-encoded (86 chars)
    const codeVerifier = randomBytes(64)
      .toString('base64url')
      .substring(0, 128);

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeChallenge, codeVerifier };
  }

  /**
   * Build the Fanvue OAuth authorization URL
   */
  buildAuthUrl(state: string, codeChallenge: string): string {
    const { clientId, redirectUri } = this.getOAuthConfig();

    const params = new URLSearchParams({
      client_id: clientId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: FANVUE_SCOPES.join(' '),
      state,
    });

    return `${FANVUE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens using PKCE code_verifier
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<FanvueTokenResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const { clientId, clientSecret, redirectUri } = this.getOAuthConfig();
      const response = await firstValueFrom(
        this.httpService.post(
          FANVUE_TOKEN_URL,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            code_verifier: codeVerifier,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: redirectUri,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, {
        expiresIn: response.data.expires_in,
        hasAccessToken: !!response.data.access_token,
        hasRefreshToken: !!response.data.refresh_token,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
        httpCode: (error as { response?: { status?: number } })?.response
          ?.status,
      });
      throw error;
    }
  }

  private getOAuthConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get('FANVUE_CLIENT_ID')?.trim();
    const clientSecret = this.configService.get('FANVUE_CLIENT_SECRET')?.trim();
    const redirectUri = this.configService.get('FANVUE_REDIRECT_URI')?.trim();

    if (
      !clientId ||
      isUnconfiguredSecret(clientId) ||
      !clientSecret ||
      isUnconfiguredSecret(clientSecret) ||
      !redirectUri ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'Fanvue OAuth is not configured for this deployment.',
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  /**
   * Refresh the access token using the refresh token
   * Proactively refreshes if token expires within 10 minutes
   */
  /**
   * @param credentialId - which connected Fanvue account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<{ accessToken: string; credential: Record<string, unknown> }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // A failed refresh flips isConnected off; the retry still has to find it.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.FANVUE,
    });

    if (!credential) {
      throw new Error('Fanvue credential not found');
    }

    if (!credential.accessToken || !credential.refreshToken) {
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw new Error(
        'Fanvue tokens not found. Please reconnect your account.',
      );
    }

    // Check if token needs refresh (expires within 10 minutes)
    const needsRefresh =
      credential.accessTokenExpiry &&
      new Date(credential.accessTokenExpiry).getTime() - Date.now() <
        10 * 60 * 1000;

    if (!needsRefresh) {
      return {
        accessToken: EncryptionUtil.decrypt(credential.accessToken),
        credential,
      };
    }

    const { clientId, clientSecret } = this.getOAuthConfig();
    const decryptedRefreshToken = EncryptionUtil.decrypt(
      credential.refreshToken,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          FANVUE_TOKEN_URL,
          new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: OAuthGrantType.REFRESH_TOKEN,
            refresh_token: decryptedRefreshToken,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const { access_token, refresh_token, expires_in, scope } = response.data;

      this.loggerService.log(`${url} token refreshed`, {
        expiresIn: expires_in,
      });

      const newRefreshToken = refresh_token || decryptedRefreshToken;

      const updatedCredential = await this.credentialsService.patch(
        credential.id,
        {
          // Stored plaintext here — CredentialsService encrypts secrets at rest.
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          refreshToken: newRefreshToken,
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      return {
        // Return the plaintext token for immediate use in this request
        accessToken: access_token,
        credential: updatedCredential,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} token refresh failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
      });
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw error;
    }
  }

  /**
   * Get the current user profile
   */
  async getUserProfile(accessToken: string): Promise<{
    uuid: string;
    email: string;
    handle: string;
    displayName: string;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${FANVUE_API_BASE}/users/me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Fanvue-API-Version': FANVUE_API_VERSION,
          },
        }),
      );

      this.loggerService.log(`${url} succeeded`, {
        handle: response.data.handle,
        uuid: response.data.uuid,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Upload media to Fanvue using the multipart upload flow:
   * 1. Create upload session
   * 2. Get signed URL for each chunk
   * 3. Upload chunks
   * 4. Complete upload session
   *
   * @param accessToken Decrypted access token
   * @param mediaUrl URL of the media file to upload (from our CDN)
   * @param mediaType 'image' or 'video'
   * @returns The media UUID for use in post creation
   */
  async uploadMedia(
    accessToken: string,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    signal?: AbortSignal,
  ): Promise<string> {
    const context: FanvueUploadContext = {
      controller: new AbortController(),
      stage: 'source',
    };
    const cancel = () => context.controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();

    try {
      const parsedUrl = new URL(mediaUrl);
      if (parsedUrl.username || parsedUrl.password) throw new Error();
      const filename =
        parsedUrl.pathname.split('/').pop() ||
        `media.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
      const sourceResponse = await this.uploadDeadline(context, 60_000, () =>
        this.uploadResponse(
          context,
          this.httpService.get<Readable>(mediaUrl, {
            headers: { Authorization: false, Cookie: false },
            maxRedirects: 21,
            responseType: 'stream',
            signal: context.controller.signal,
            timeout: 0,
            transformRequest: this.uploadCredentialTransforms(),
          }),
        ),
      );
      const source = sourceResponse.data;
      context.source = source;
      context.sourceAborted = () => context.controller.abort();
      source.on('aborted', context.sourceAborted);
      context.sourceDone = finished(source, { cleanup: true }).then(
        () => true,
        () => {
          context.controller.abort();
          return false;
        },
      );
      if (
        sourceResponse.status !== 200 ||
        sourceResponse.headers['content-range']
      )
        throw new Error();
      const iterator = source[Symbol.asyncIterator]();
      const firstChunk = await this.nextUploadChunk(context, iterator);
      if (!firstChunk) throw new Error();
      context.stage = 'create';
      const sessionResponse = await this.uploadDeadline(context, 30_000, () =>
        this.uploadResponse(
          context,
          this.httpService.post<unknown>(
            `${FANVUE_API_BASE}/media/uploads`,
            { name: filename, filename, mediaType },
            this.uploadControlConfig(accessToken, context),
          ),
        ),
      );
      const session = fanvueUploadSessionSchema.parse(sessionResponse.data);
      const parts = await this.transferUploadParts(
        context,
        iterator,
        firstChunk,
        session,
        accessToken,
      );
      context.stage = 'source';
      if (!(await this.observeUpload(context, context.sourceDone)))
        throw new Error();
      context.controller.signal.throwIfAborted();
      context.stage = 'complete';
      await this.uploadDeadline(context, 30_000, () =>
        this.uploadResponse(
          context,
          this.httpService.patch(
            `${FANVUE_API_BASE}/media/uploads/${encodeURIComponent(session.uploadId)}`,
            { parts },
            this.uploadControlConfig(accessToken, context),
          ),
        ),
      );
      context.controller.signal.throwIfAborted();
      return session.mediaUuid;
    } catch (error: unknown) {
      const status = this.uploadErrorStatus(error);
      this.loggerService.error('Fanvue media upload failed', {
        stage: context.stage,
        ...(status === undefined ? {} : { httpCode: status }),
      });
      throw new Error('Fanvue media upload failed');
    } finally {
      await this.cleanupUpload(context, signal, cancel);
    }
  }

  private async cleanupUpload(
    context: FanvueUploadContext,
    signal: AbortSignal | undefined,
    cancel: () => void,
  ): Promise<void> {
    try {
      context.controller.abort();
      signal?.removeEventListener('abort', cancel);
      context.source?.destroy();
      await context.sourceDone;
    } catch {
      this.loggerService.error('Fanvue media upload failed', {
        stage: 'cleanup',
      });
      throw new Error('Fanvue media upload failed');
    } finally {
      if (context.sourceAborted)
        context.source?.removeListener('aborted', context.sourceAborted);
    }
  }

  private uploadCredentialTransforms(
    accessToken?: string,
  ): AxiosRequestTransformer[] {
    const defaults = this.httpService.axiosRef.defaults.transformRequest;
    const configured = Array.isArray(defaults)
      ? [...defaults]
      : defaults
        ? [defaults]
        : [];
    // Run last: Axios otherwise regenerates Basic auth from merged defaults.
    const credentials: AxiosRequestTransformer = function (
      data: unknown,
      headers,
    ) {
      delete this.auth;
      headers.set('Cookie', false, true);
      headers.set(
        'Authorization',
        accessToken === undefined ? false : `Bearer ${accessToken}`,
        true,
      );
      return data;
    };
    return [...configured, credentials];
  }

  private uploadResponse<T>(
    context: FanvueUploadContext,
    response: Observable<T>,
  ): Promise<T> {
    context.controller.signal.throwIfAborted();
    return firstValueFrom(
      response.pipe(takeUntil(fromEvent(context.controller.signal, 'abort'))),
    );
  }

  private uploadControlConfig(
    accessToken: string,
    context: FanvueUploadContext,
  ): AxiosRequestConfig {
    return {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: false,
        'Content-Type': 'application/json',
        'X-Fanvue-API-Version': FANVUE_API_VERSION,
      },
      maxRedirects: 0,
      signal: context.controller.signal,
      timeout: 0,
      transformRequest: this.uploadCredentialTransforms(accessToken),
    };
  }

  private uploadErrorStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null || !('response' in error))
      return;
    const response = error.response;
    if (
      typeof response !== 'object' ||
      response === null ||
      !('status' in response)
    )
      return;
    return typeof response.status === 'number' &&
      Number.isFinite(response.status)
      ? response.status
      : undefined;
  }

  private async observeUpload<T>(
    context: FanvueUploadContext,
    operation: Promise<T>,
  ): Promise<T> {
    const signal = context.controller.signal;
    let cancel: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new Error());
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    try {
      return await Promise.race([operation, aborted]);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  private async uploadDeadline<T>(
    context: FanvueUploadContext,
    milliseconds: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    context.controller.signal.throwIfAborted();
    const timer = setTimeout(() => context.controller.abort(), milliseconds);
    try {
      return await this.observeUpload(context, operation());
    } finally {
      clearTimeout(timer);
    }
  }

  private async nextUploadChunk(
    context: FanvueUploadContext,
    iterator: AsyncIterator<unknown>,
  ): Promise<Uint8Array | undefined> {
    context.stage = 'source';
    return this.uploadDeadline(context, 60_000, async () => {
      while (true) {
        const next = await this.observeUpload(context, iterator.next());
        if (next.done) return;
        if (!(next.value instanceof Uint8Array)) throw new Error();
        if (next.value.byteLength > 0) return next.value;
      }
    });
  }

  private async transferUploadParts(
    context: FanvueUploadContext,
    iterator: AsyncIterator<unknown>,
    firstChunk: Uint8Array,
    session: FanvueUploadSession,
    accessToken: string,
  ): Promise<FanvueUploadedPart[]> {
    const buffer = Buffer.allocUnsafe(session.partSize);
    const parts: FanvueUploadedPart[] = [];
    let chunk: Uint8Array | undefined = firstChunk;
    let offset = 0;
    let filled = 0;
    let byteCount = 0;
    while (chunk) {
      if (parts.length >= session.maxParts) throw new Error();
      const length = Math.min(
        buffer.length - filled,
        chunk.byteLength - offset,
      );
      if (!Number.isSafeInteger(byteCount + length)) throw new Error();
      buffer.set(chunk.subarray(offset, offset + length), filled);
      byteCount += length;
      offset += length;
      filled += length;
      if (filled === buffer.length) {
        parts.push(
          await this.uploadPart(
            context,
            session,
            parts.length + 1,
            buffer,
            accessToken,
          ),
        );
        filled = 0;
      }
      if (offset === chunk.byteLength) {
        chunk = await this.nextUploadChunk(context, iterator);
        offset = 0;
      }
    }
    if (filled > 0) {
      parts.push(
        await this.uploadPart(
          context,
          session,
          parts.length + 1,
          buffer.subarray(0, filled),
          accessToken,
        ),
      );
    }
    if (parts.length === 0 || !Number.isSafeInteger(parts.length))
      throw new Error();
    return parts;
  }

  private async uploadPart(
    context: FanvueUploadContext,
    session: FanvueUploadSession,
    partNumber: number,
    buffer: Buffer,
    accessToken: string,
  ): Promise<FanvueUploadedPart> {
    context.stage = 'sign';
    const signed = await this.uploadDeadline(context, 30_000, () =>
      this.uploadResponse(
        context,
        this.httpService.get<unknown>(
          `${FANVUE_API_BASE}/media/uploads/${encodeURIComponent(session.uploadId)}/parts/${partNumber}/url`,
          {
            ...this.uploadControlConfig(accessToken, context),
            responseType: 'text',
          },
        ),
      ),
    );
    if (typeof signed.data !== 'string' || signed.data.trim() !== signed.data)
      throw new Error();
    const parsed = new URL(signed.data);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
      throw new Error();
    context.stage = 'put';
    const transport = this.uploadPartTransport(context);
    try {
      const response = await this.observeUpload(
        context,
        this.uploadResponse(
          context,
          this.httpService.put(signed.data, buffer, {
            headers: {
              Authorization: false,
              Cookie: false,
              'Content-Length': buffer.length,
              'Content-Type': 'application/octet-stream',
            },
            maxBodyLength: Infinity,
            maxRedirects: 0,
            proxy: false,
            signal: context.controller.signal,
            timeout: 60_000,
            transformRequest: this.uploadCredentialTransforms(),
            // Custom transport keeps Axios's socket idle timeout without its native-path wall timer.
            transport: { request: transport.request },
          }),
        ),
      );
      if (
        !transport.finished ||
        !(await this.observeUpload(context, transport.finished))
      )
        throw new Error();
      if (response.status < 200 || response.status >= 300) throw new Error();
      const etag = Object.entries(response.headers).find(
        ([name]) => name.toLowerCase() === 'etag',
      )?.[1];
      if (typeof etag !== 'string' || !etag.trim()) throw new Error();
      context.controller.signal.throwIfAborted();
      return { ETag: etag, PartNumber: partNumber };
    } finally {
      await transport.dispose();
    }
  }

  private uploadPartTransport(
    context: FanvueUploadContext,
  ): FanvuePartTransport {
    const transport: FanvuePartTransport = {
      dispose: async () => undefined,
      request: (options, callback) => {
        const request = requestHttps(options, callback);
        const closed = new Promise<void>((resolve) =>
          request.once('close', resolve),
        );
        const timer = setTimeout(() => request.destroy(new Error()), 60_000);
        let socket: Socket | undefined;
        const connected = () => clearTimeout(timer);
        const onSocket = (assigned: Socket) => {
          socket = assigned;
          if (
            request.reusedSocket ||
            (!assigned.connecting && !(assigned instanceof TLSSocket))
          )
            connected();
          else
            assigned.once(
              assigned instanceof TLSSocket ? 'secureConnect' : 'connect',
              connected,
            );
        };
        request.on('socket', onSocket);
        request.once('error', connected);
        request.once('close', connected);
        transport.finished = finished(request, {
          cleanup: true,
          readable: false,
        }).then(
          () => true,
          () => {
            context.controller.abort();
            return false;
          },
        );
        transport.dispose = async () => {
          clearTimeout(timer);
          request.removeListener('socket', onSocket);
          request.removeListener('error', connected);
          request.removeListener('close', connected);
          socket?.removeListener('connect', connected);
          socket?.removeListener('secureConnect', connected);
          socket?.setTimeout(0);
          request.destroy();
          await closed;
        };
        return request;
      },
    };
    return transport;
  }

  /**
   * Create a post on Fanvue
   */
  /**
   * @param credentialId - which connected Fanvue account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  async createPost(
    organizationId: string,
    brandId: string,
    content: string,
    mediaUuids?: string[],
    credentialId?: string,
  ): Promise<FanvuePostResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const { accessToken } = await this.refreshToken(
      organizationId,
      brandId,
      credentialId,
    );

    try {
      const body: Record<string, unknown> = {
        content,
        isLocked: false,
        price: 0,
        visibility: 'public',
      };

      if (mediaUuids?.length) {
        body.mediaUuids = mediaUuids;
      }

      const response = await firstValueFrom(
        this.httpService.post<FanvuePostResponse>(
          `${FANVUE_API_BASE}/posts`,
          body,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Fanvue-API-Version': FANVUE_API_VERSION,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, {
        postUuid: response.data.uuid,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
      });
      throw error;
    }
  }
}
