import { createHash, randomBytes } from 'node:crypto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

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
];

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

interface FanvueTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface FanvueUploadSession {
  mediaUuid: string;
  uploadId: string;
  status: string;
}

interface FanvueSignedUrl {
  signedUrl: string;
  partNumber: number;
  method: string;
  expiresAt: string;
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
    const clientId = this.configService.get('FANVUE_CLIENT_ID');
    const redirectUri = this.configService.get('FANVUE_REDIRECT_URI');

    const params = new URLSearchParams({
      client_id: clientId,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: FANVUE_SCOPES.join(' '),
      state,
    } as Record<string, string>);

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

    const clientId = this.configService.get('FANVUE_CLIENT_ID');
    const clientSecret = this.configService.get('FANVUE_CLIENT_SECRET');
    const redirectUri = this.configService.get('FANVUE_REDIRECT_URI');

    try {
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
          } as Record<string, string>).toString(),
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

  /**
   * Refresh the access token using the refresh token
   * Proactively refreshes if token expires within 10 minutes
   */
  async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<{ accessToken: string; credential: Record<string, unknown> }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.findOne({
      brand: brandId,
      isDeleted: false,
      organization: organizationId,
      platform: CredentialPlatform.FANVUE,
    });

    if (!credential) {
      throw new Error('Fanvue credential not found');
    }

    if (!credential.accessToken || !credential.refreshToken) {
      await this.credentialsService.patch(credential._id, {
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

    const clientId = this.configService.get('FANVUE_CLIENT_ID');
    const clientSecret = this.configService.get('FANVUE_CLIENT_SECRET');
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
          } as Record<string, string>).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const { access_token, refresh_token, expires_in } = response.data;

      this.loggerService.log(`${url} token refreshed`, {
        expiresIn: expires_in,
      });

      const updatedCredential = await this.credentialsService.patch(
        credential._id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
          refreshToken: refresh_token || decryptedRefreshToken,
        },
      );

      return {
        accessToken: access_token,
        credential: updatedCredential,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} token refresh failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
      });
      await this.credentialsService.patch(credential._id, {
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
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Download the file from our CDN
      const fileResponse = await firstValueFrom(
        this.httpService.get(mediaUrl, {
          responseType: 'arraybuffer',
        }),
      );

      const fileBuffer = Buffer.from(fileResponse.data);
      const fileSize = fileBuffer.length;

      // Derive filename and mimetype from URL
      const urlPath = new URL(mediaUrl).pathname;
      const fileName =
        urlPath.split('/').pop() ||
        `media.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
      const mimeType = mediaType === 'image' ? 'image/jpeg' : 'video/mp4';

      this.loggerService.log(`${url} creating upload session`, {
        fileName,
        fileSize,
        mediaType,
        mimeType,
      });

      // Step 1: Create upload session
      const sessionResponse = await firstValueFrom(
        this.httpService.post<FanvueUploadSession>(
          `${FANVUE_API_BASE}/media/uploads`,
          {
            fileName,
            fileSize,
            mediaType,
            mimeType,
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Fanvue-API-Version': FANVUE_API_VERSION,
            },
          },
        ),
      );

      const { mediaUuid, uploadId } = sessionResponse.data;

      this.loggerService.log(`${url} upload session created`, {
        mediaUuid,
        uploadId,
      });

      // Step 2 & 3: Upload chunks
      const totalParts = Math.ceil(fileSize / CHUNK_SIZE);
      const etags: Array<{ etag: string; partNumber: number }> = [];

      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileSize);
        const chunk = fileBuffer.subarray(start, end);

        // Get signed URL for this part
        const signedUrlResponse = await firstValueFrom(
          this.httpService.get<FanvueSignedUrl>(
            `${FANVUE_API_BASE}/media/uploads/${uploadId}/parts/${partNumber}/url`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-Fanvue-API-Version': FANVUE_API_VERSION,
              },
            },
          ),
        );

        const { signedUrl } = signedUrlResponse.data;

        // Upload chunk to signed URL
        const uploadResponse = await firstValueFrom(
          this.httpService.put(signedUrl, chunk, {
            headers: {
              'Content-Type': 'application/octet-stream',
            },
          }),
        );

        const etag = uploadResponse.headers.etag || uploadResponse.headers.ETag;
        etags.push({ etag, partNumber });

        this.loggerService.log(
          `${url} uploaded part ${partNumber}/${totalParts}`,
          {
            mediaUuid,
            partNumber,
          },
        );
      }

      // Step 4: Complete upload
      await firstValueFrom(
        this.httpService.patch(
          `${FANVUE_API_BASE}/media/uploads/${uploadId}`,
          {
            parts: etags,
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Fanvue-API-Version': FANVUE_API_VERSION,
            },
          },
        ),
      );

      this.loggerService.log(`${url} upload completed`, {
        mediaUuid,
        totalParts,
      });

      return mediaUuid;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error:
          (error as { response?: { data?: unknown } })?.response?.data ||
          (error as Error)?.message,
        mediaUrl,
      });
      throw error;
    }
  }

  /**
   * Create a post on Fanvue
   */
  async createPost(
    organizationId: string,
    brandId: string,
    content: string,
    mediaUuids?: string[],
  ): Promise<FanvuePostResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const { accessToken } = await this.refreshToken(organizationId, brandId);

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
